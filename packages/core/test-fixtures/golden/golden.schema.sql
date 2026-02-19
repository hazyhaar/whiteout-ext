-- golden.schema.sql — DDL source de vérité pour golden.db
-- Base de scénarios déterministes pour les tests E2E du pipeline Whiteout.

CREATE TABLE IF NOT EXISTS scenarios (
  scenario_id   TEXT PRIMARY KEY,
  description   TEXT NOT NULL,
  language      TEXT NOT NULL DEFAULT 'fr',
  input_text    TEXT NOT NULL,
  uses_touchstone INTEGER NOT NULL DEFAULT 1,
  alias_style   TEXT NOT NULL DEFAULT 'generic',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mock_touchstone (
  scenario_id   TEXT NOT NULL REFERENCES scenarios(scenario_id),
  term          TEXT NOT NULL,
  dict          TEXT NOT NULL,
  match         INTEGER NOT NULL DEFAULT 1,
  type          TEXT NOT NULL,
  jurisdiction  TEXT NOT NULL DEFAULT 'fr',
  confidence    TEXT NOT NULL DEFAULT 'high',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (scenario_id, term, dict)
);

CREATE TABLE IF NOT EXISTS expected_entities (
  scenario_id   TEXT NOT NULL REFERENCES scenarios(scenario_id),
  entity_index  INTEGER NOT NULL,
  text          TEXT NOT NULL,
  type          TEXT NOT NULL,
  confidence    TEXT NOT NULL,
  proposed_alias TEXT NOT NULL,
  PRIMARY KEY (scenario_id, entity_index)
);

CREATE TABLE IF NOT EXISTS expected_outputs (
  scenario_id     TEXT NOT NULL REFERENCES scenarios(scenario_id),
  anonymized_text TEXT NOT NULL,
  detected_lang   TEXT NOT NULL,
  deanonymized_text TEXT,
  PRIMARY KEY (scenario_id)
);

CREATE TABLE IF NOT EXISTS scenario_tags (
  scenario_id   TEXT NOT NULL REFERENCES scenarios(scenario_id),
  tag           TEXT NOT NULL,
  PRIMARY KEY (scenario_id, tag)
);
