/**
 * generate-golden.ts — Generates golden.db from scenarios + pipeline execution.
 *
 * Usage: npx tsx packages/core/test-fixtures/golden/generate-golden.ts
 *
 * The script is self-verifiable: it computes expected outputs by running the
 * pipeline itself with deterministic aliases (generic style + resetAliasCounters).
 */

import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { pipeline } from "../../src/index.js";
import { resetAliasCounters } from "../../src/alias-generator.js";
import { deanonymize } from "../../src/anonymize.js";
import { MemoryStore } from "../../src/ports.js";
import type { FetchPort } from "../../src/ports.js";
import type { TouchstoneResult } from "../../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "golden.schema.sql");
const DB_PATH = resolve(__dirname, "golden.db");

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

interface ScenarioDef {
  id: string;
  description: string;
  language: string;
  input_text: string;
  uses_touchstone: boolean;
  mock_classifications: Record<string, { dict: string; match: boolean; type: string; jurisdiction?: string; confidence?: string }[]>;
  tags: string[];
}

const scenarios: ScenarioDef[] = [
  {
    id: "scen_fr_person_basic",
    description: "Personne + ville via honorifique (M. Dupont... Lyon)",
    language: "fr",
    input_text: "M. Dupont habite à Lyon depuis dix ans.",
    uses_touchstone: true,
    mock_classifications: {
      Dupont: [{ dict: "surnames", match: true, type: "surname" }],
      Lyon: [{ dict: "communes", match: true, type: "city" }],
    },
    tags: ["person", "city", "honorific", "fr"],
  },
  {
    id: "scen_fr_company_multi",
    description: "Deux sociétés SCI + SARL",
    language: "fr",
    input_text: "La SCI Bellevue et la SARL Dumont Frères sont co-propriétaires.",
    uses_touchstone: true,
    mock_classifications: {
      Bellevue: [{ dict: "company_names", match: true, type: "company" }],
      "Dumont Frères": [{ dict: "company_names", match: true, type: "company" }],
      Dumont: [{ dict: "surnames", match: true, type: "surname" }],
    },
    tags: ["company", "legal_form", "fr"],
  },
  {
    id: "scen_fr_patterns_only",
    description: "Email + téléphone + IBAN, mode offline",
    language: "fr",
    input_text: "Contacter jean.dupont@gmail.com au 06 12 34 56 78 ou virer sur FR76 3000 6000 0112 3456 7890 189.",
    uses_touchstone: false,
    mock_classifications: {},
    tags: ["pattern", "email", "phone", "iban", "offline"],
  },
  {
    id: "scen_fr_fullname_merge",
    description: "Fusion prénom+nom adjacents (Jean Dupont, Marie-Claire Martin)",
    language: "fr",
    input_text: "Jean Dupont et Marie-Claire Martin signent le bail.",
    uses_touchstone: true,
    mock_classifications: {
      Jean: [{ dict: "firstnames", match: true, type: "first_name" }],
      Dupont: [{ dict: "surnames", match: true, type: "surname" }],
      "Marie-Claire": [{ dict: "firstnames", match: true, type: "first_name" }],
      Martin: [{ dict: "surnames", match: true, type: "surname" }],
    },
    tags: ["person", "merge", "fullname", "fr"],
  },
  {
    id: "scen_en_person_company",
    description: "Personne + société en anglais (Mr. Smith, Acme Corporation Ltd)",
    language: "en",
    input_text: "Mr. Smith from Acme Corporation Ltd confirmed the deal.",
    uses_touchstone: true,
    mock_classifications: {
      Smith: [{ dict: "surnames", match: true, type: "surname", jurisdiction: "en" }],
      "Acme Corporation": [{ dict: "company_names", match: true, type: "company", jurisdiction: "en" }],
      Acme: [{ dict: "company_names", match: true, type: "company", jurisdiction: "en" }],
    },
    tags: ["person", "company", "en"],
  },
  {
    id: "scen_fr_ssn_url",
    description: "NIR français + URL, mode offline",
    language: "fr",
    input_text: "Le NIR est 1 85 12 75 108 042 36 et le site est https://www.example.com/dossier.",
    uses_touchstone: false,
    mock_classifications: {},
    tags: ["pattern", "ssn", "url", "offline"],
  },
  {
    id: "scen_fr_session_consistency",
    description: "Même entité dans 2 textes, même sessionId",
    language: "fr",
    input_text: "M. Dupont signe le contrat.",
    uses_touchstone: true,
    mock_classifications: {
      Dupont: [{ dict: "surnames", match: true, type: "surname" }],
    },
    tags: ["session", "consistency", "fr"],
  },
  {
    id: "scen_fr_roundtrip",
    description: "Cycle anonymize → deanonymize",
    language: "fr",
    input_text: "Mme Durand habite au 15 rue de la Paix à Marseille.",
    uses_touchstone: false,
    mock_classifications: {},
    tags: ["roundtrip", "deanonymize", "offline"],
  },
];

// ---------------------------------------------------------------------------
// Mock FetchPort factory
// ---------------------------------------------------------------------------

function createMockFetch(
  classifications: Record<string, { dict: string; match: boolean; type: string; jurisdiction?: string; confidence?: string }[]>
): FetchPort {
  return {
    async post(_url: string, body: string) {
      const req = JSON.parse(body) as { terms: string[] };
      const results: Record<string, unknown[]> = {};
      for (const term of req.terms) {
        if (classifications[term]) {
          results[term] = classifications[term].map((c) => ({
            dict: c.dict,
            match: c.match,
            type: c.type,
            jurisdiction: c.jurisdiction ?? "fr",
            confidence: c.confidence ?? "high",
            metadata: {},
          }));
        }
      }
      return {
        status: 200,
        body: JSON.stringify({ classifications: results }),
      };
    },
  };
}

const offlineFetch: FetchPort = {
  async post(): Promise<{ status: number; body: string }> {
    throw new Error("Offline mode — should not be called");
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Remove existing db
  const { unlinkSync } = await import("fs");
  try { unlinkSync(DB_PATH); } catch { /* ignore */ }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Apply schema
  const schema = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(schema);

  // Prepared statements
  const insertScenario = db.prepare(
    `INSERT INTO scenarios (scenario_id, description, language, input_text, uses_touchstone, alias_style)
     VALUES (?, ?, ?, ?, ?, 'generic')`
  );
  const insertMock = db.prepare(
    `INSERT INTO mock_touchstone (scenario_id, term, dict, match, type, jurisdiction, confidence, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEntity = db.prepare(
    `INSERT INTO expected_entities (scenario_id, entity_index, text, type, confidence, proposed_alias)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertOutput = db.prepare(
    `INSERT INTO expected_outputs (scenario_id, anonymized_text, detected_lang, deanonymized_text)
     VALUES (?, ?, ?, ?)`
  );
  const insertTag = db.prepare(
    `INSERT INTO scenario_tags (scenario_id, tag) VALUES (?, ?)`
  );

  for (const scen of scenarios) {
    console.log(`Processing ${scen.id}...`);

    // Insert scenario
    insertScenario.run(scen.id, scen.description, scen.language, scen.input_text, scen.uses_touchstone ? 1 : 0);

    // Insert mock classifications
    for (const [term, results] of Object.entries(scen.mock_classifications)) {
      for (const r of results) {
        insertMock.run(
          scen.id, term, r.dict, r.match ? 1 : 0, r.type,
          r.jurisdiction ?? "fr", r.confidence ?? "high", "{}"
        );
      }
    }

    // Insert tags
    for (const tag of scen.tags) {
      insertTag.run(scen.id, tag);
    }

    // Run pipeline with deterministic aliases
    resetAliasCounters();
    const store = new MemoryStore();
    const fetchPort = scen.uses_touchstone
      ? createMockFetch(scen.mock_classifications)
      : offlineFetch;

    const result = await pipeline(scen.input_text, fetchPort, store, `golden_${scen.id}`, {
      aliasStyle: "generic",
      decoyRatio: 0,
    });

    // Insert expected entities
    for (let i = 0; i < result.entities.length; i++) {
      const e = result.entities[i];
      insertEntity.run(scen.id, i, e.text, e.type, e.confidence, e.proposedAlias);
    }

    // Compute deanonymized text for roundtrip scenario
    let deanonymizedText: string | null = null;
    if (scen.id === "scen_fr_roundtrip") {
      const aliasTable: Record<string, string> = {};
      for (const e of result.entities) {
        aliasTable[e.text] = e.proposedAlias;
      }
      deanonymizedText = deanonymize(result.anonymizedText, aliasTable);
    }

    // Insert expected output
    insertOutput.run(scen.id, result.anonymizedText, result.language, deanonymizedText);
  }

  // Special: session consistency scenario needs a second text
  {
    const scen = scenarios.find((s) => s.id === "scen_fr_session_consistency")!;
    const secondText = "M. Dupont confirme la vente.";

    // Run pipeline twice with same session to verify consistency
    resetAliasCounters();
    const store = new MemoryStore();
    const fetchPort = createMockFetch(scen.mock_classifications);
    const sessionId = "golden_session_consistency";

    const r1 = await pipeline(scen.input_text, fetchPort, store, sessionId, {
      aliasStyle: "generic",
      decoyRatio: 0,
    });
    const r2 = await pipeline(secondText, fetchPort, store, sessionId, {
      aliasStyle: "generic",
      decoyRatio: 0,
    });

    // Store the second text and its output as metadata in expected_outputs
    // We use deanonymized_text field to store the second call's anonymized text
    db.prepare(
      `UPDATE expected_outputs SET deanonymized_text = ? WHERE scenario_id = ?`
    ).run(
      JSON.stringify({
        second_input: secondText,
        second_anonymized: r2.anonymizedText,
        alias_from_first: r1.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias,
        alias_from_second: r2.entities.find((e) => e.text.includes("Dupont"))?.proposedAlias,
      }),
      "scen_fr_session_consistency"
    );
  }

  db.close();
  console.log(`\ngolden.db generated successfully at ${DB_PATH}`);
  console.log(`${scenarios.length} scenarios inserted.`);
}

main().catch((err) => {
  console.error("Failed to generate golden.db:", err);
  process.exit(1);
});
