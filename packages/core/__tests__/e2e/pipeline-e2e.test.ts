/**
 * Pipeline E2E tests — validates the full pipeline against golden.db scenarios.
 *
 * Each scenario uses aliasStyle: "generic" + resetAliasCounters() for
 * deterministic, reproducible alias generation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { pipeline } from "../../src/index.js";
import { resetAliasCounters } from "../../src/alias-generator.js";
import { deanonymize } from "../../src/anonymize.js";
import { MemoryStore } from "../../src/ports.js";
import { GoldenDB } from "./helpers/golden-loader.js";
import { createMockFetchFromGolden, createOfflineFetch } from "./helpers/mock-fetch-factory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DB_PATH = resolve(__dirname, "../../test-fixtures/golden/golden.db");

let golden: GoldenDB;

beforeAll(() => {
  golden = new GoldenDB(GOLDEN_DB_PATH);
});

afterAll(() => {
  golden.close();
});

// Standard scenarios: all except session_consistency and roundtrip which have special logic
const standardScenarios = [
  "scen_fr_person_basic",
  "scen_fr_company_multi",
  "scen_fr_patterns_only",
  "scen_fr_fullname_merge",
  "scen_en_person_company",
  "scen_fr_ssn_url",
];

describe("Pipeline E2E — golden.db", () => {
  describe.each(standardScenarios)("%s", (scenarioId) => {
    beforeEach(() => {
      resetAliasCounters();
    });

    it("detects the correct language", async () => {
      const scen = golden.getScenario(scenarioId);
      const expected = golden.getExpectedOutput(scenarioId);
      const classifications = golden.getMockClassificationsByTerm(scenarioId);
      const { fetchPort } = scen.uses_touchstone
        ? createMockFetchFromGolden(classifications)
        : createOfflineFetch();
      const store = new MemoryStore();

      const result = await pipeline(scen.input_text, fetchPort, store, `test_${scenarioId}`, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      expect(result.language).toBe(expected.detected_lang);
    });

    it("detects the correct entities (text, type, confidence)", async () => {
      const scen = golden.getScenario(scenarioId);
      const expectedEntities = golden.getExpectedEntities(scenarioId);
      const classifications = golden.getMockClassificationsByTerm(scenarioId);
      const { fetchPort } = scen.uses_touchstone
        ? createMockFetchFromGolden(classifications)
        : createOfflineFetch();
      const store = new MemoryStore();

      const result = await pipeline(scen.input_text, fetchPort, store, `test_${scenarioId}`, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      expect(result.entities.length).toBe(expectedEntities.length);

      for (let i = 0; i < expectedEntities.length; i++) {
        const actual = result.entities[i];
        const expected = expectedEntities[i];
        expect(actual.text).toBe(expected.text);
        expect(actual.type).toBe(expected.type);
        expect(actual.confidence).toBe(expected.confidence);
      }
    });

    it("generates the correct generic aliases", async () => {
      const scen = golden.getScenario(scenarioId);
      const expectedEntities = golden.getExpectedEntities(scenarioId);
      const classifications = golden.getMockClassificationsByTerm(scenarioId);
      const { fetchPort } = scen.uses_touchstone
        ? createMockFetchFromGolden(classifications)
        : createOfflineFetch();
      const store = new MemoryStore();

      const result = await pipeline(scen.input_text, fetchPort, store, `test_${scenarioId}`, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      for (let i = 0; i < expectedEntities.length; i++) {
        expect(result.entities[i].proposedAlias).toBe(expectedEntities[i].proposed_alias);
      }
    });

    it("produces the correct anonymized text", async () => {
      const scen = golden.getScenario(scenarioId);
      const expected = golden.getExpectedOutput(scenarioId);
      const classifications = golden.getMockClassificationsByTerm(scenarioId);
      const { fetchPort } = scen.uses_touchstone
        ? createMockFetchFromGolden(classifications)
        : createOfflineFetch();
      const store = new MemoryStore();

      const result = await pipeline(scen.input_text, fetchPort, store, `test_${scenarioId}`, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      expect(result.anonymizedText).toBe(expected.anonymized_text);
    });
  });

  describe("scen_fr_session_consistency", () => {
    beforeEach(() => {
      resetAliasCounters();
    });

    it("reuses the same alias across two pipeline calls with the same sessionId", async () => {
      const scen = golden.getScenario("scen_fr_session_consistency");
      const expected = golden.getExpectedOutput("scen_fr_session_consistency");
      const sessionData = JSON.parse(expected.deanonymized_text!);
      const classifications = golden.getMockClassificationsByTerm("scen_fr_session_consistency");
      const { fetchPort } = createMockFetchFromGolden(classifications);
      const store = new MemoryStore();
      const sessionId = "test_session_consistency";

      const r1 = await pipeline(scen.input_text, fetchPort, store, sessionId, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      const r2 = await pipeline(sessionData.second_input, fetchPort, store, sessionId, {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      const alias1 = r1.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias;
      const alias2 = r2.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias;

      expect(alias1).toBeTruthy();
      expect(alias1).toBe(alias2);
      expect(alias1).toBe(sessionData.alias_from_first);
    });
  });

  describe("scen_fr_roundtrip", () => {
    beforeEach(() => {
      resetAliasCounters();
    });

    it("deanonymize restores the original entities", async () => {
      const scen = golden.getScenario("scen_fr_roundtrip");
      const classifications = golden.getMockClassificationsByTerm("scen_fr_roundtrip");
      const { fetchPort } = scen.uses_touchstone
        ? createMockFetchFromGolden(classifications)
        : createOfflineFetch();
      const store = new MemoryStore();

      const result = await pipeline(scen.input_text, fetchPort, store, "test_roundtrip", {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      // Build alias table
      const aliasTable: Record<string, string> = {};
      for (const e of result.entities) {
        aliasTable[e.text] = e.proposedAlias;
      }

      const restored = deanonymize(result.anonymizedText, aliasTable);

      // The restored text should contain the original entity terms
      for (const e of result.entities) {
        expect(restored).toContain(e.text);
      }
    });
  });

  describe("scen_fr_patterns_only — offline mode", () => {
    beforeEach(() => {
      resetAliasCounters();
    });

    it("makes zero Touchstone calls", async () => {
      const scen = golden.getScenario("scen_fr_patterns_only");
      const { fetchPort, callCount } = createOfflineFetch();
      const store = new MemoryStore();

      await pipeline(scen.input_text, fetchPort, store, "test_offline", {
        aliasStyle: "generic",
        decoyRatio: 0,
      });

      expect(callCount()).toBe(0);
    });
  });
});
