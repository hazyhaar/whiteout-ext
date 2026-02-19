/**
 * GoldenDB — Read-only accessor for golden.db scenarios.
 *
 * Wraps better-sqlite3 in readonly mode and provides typed getters
 * for all golden.db tables.
 */

import Database from "better-sqlite3";
import type { EntityType } from "../../../src/types.js";

export interface GoldenScenario {
  scenario_id: string;
  description: string;
  language: string;
  input_text: string;
  uses_touchstone: number;
  alias_style: string;
}

export interface GoldenMockClassification {
  term: string;
  dict: string;
  match: number;
  type: string;
  jurisdiction: string;
  confidence: string;
  metadata_json: string;
}

export interface GoldenEntity {
  entity_index: number;
  text: string;
  type: EntityType;
  confidence: string;
  proposed_alias: string;
}

export interface GoldenOutput {
  anonymized_text: string;
  detected_lang: string;
  deanonymized_text: string | null;
}

export class GoldenDB {
  private db: InstanceType<typeof Database>;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
    this.db.pragma("journal_mode = WAL");
  }

  close(): void {
    this.db.close();
  }

  allScenarioIds(): string[] {
    const rows = this.db
      .prepare("SELECT scenario_id FROM scenarios ORDER BY scenario_id")
      .all() as { scenario_id: string }[];
    return rows.map((r) => r.scenario_id);
  }

  getScenario(id: string): GoldenScenario {
    const row = this.db
      .prepare("SELECT * FROM scenarios WHERE scenario_id = ?")
      .get(id) as GoldenScenario | undefined;
    if (!row) throw new Error(`Scenario not found: ${id}`);
    return row;
  }

  getMockClassifications(id: string): GoldenMockClassification[] {
    return this.db
      .prepare("SELECT term, dict, match, type, jurisdiction, confidence, metadata_json FROM mock_touchstone WHERE scenario_id = ?")
      .all(id) as GoldenMockClassification[];
  }

  /**
   * Returns mock classifications grouped by term, in the format expected
   * by createMockFetchFromGolden.
   */
  getMockClassificationsByTerm(id: string): Record<string, { dict: string; match: boolean; type: string; jurisdiction: string; confidence: string; metadata: Record<string, string | number> }[]> {
    const rows = this.getMockClassifications(id);
    const result: Record<string, { dict: string; match: boolean; type: string; jurisdiction: string; confidence: string; metadata: Record<string, string | number> }[]> = {};
    for (const row of rows) {
      if (!result[row.term]) result[row.term] = [];
      result[row.term].push({
        dict: row.dict,
        match: row.match === 1,
        type: row.type,
        jurisdiction: row.jurisdiction,
        confidence: row.confidence,
        metadata: JSON.parse(row.metadata_json),
      });
    }
    return result;
  }

  getExpectedEntities(id: string): GoldenEntity[] {
    return this.db
      .prepare("SELECT entity_index, text, type, confidence, proposed_alias FROM expected_entities WHERE scenario_id = ? ORDER BY entity_index")
      .all(id) as GoldenEntity[];
  }

  getExpectedOutput(id: string): GoldenOutput {
    const row = this.db
      .prepare("SELECT anonymized_text, detected_lang, deanonymized_text FROM expected_outputs WHERE scenario_id = ?")
      .get(id) as GoldenOutput | undefined;
    if (!row) throw new Error(`Expected output not found for scenario: ${id}`);
    return row;
  }

  getTaggedScenarios(tag: string): string[] {
    const rows = this.db
      .prepare("SELECT scenario_id FROM scenario_tags WHERE tag = ? ORDER BY scenario_id")
      .all(tag) as { scenario_id: string }[];
    return rows.map((r) => r.scenario_id);
  }
}
