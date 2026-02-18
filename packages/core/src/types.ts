/** A single token from the tokenizer. */
export interface Token {
  text: string;
  start: number;
  end: number;
  kind: "word" | "number" | "punctuation" | "whitespace" | "pattern";
  patternType?: PatternType;
}

export type PatternType = "email" | "phone" | "iban" | "ssn_fr" | "url";

/** A group of tokens identified as a potential entity by the local detector. */
export interface DetectedGroup {
  tokens: Token[];
  text: string;
  localType?: LocalType;
  confidence: "certain" | "probable" | "candidate";
  skipTouchstone: boolean;
}

export type LocalType =
  | "person_candidate"
  | "company_candidate"
  | "address_fragment"
  | "email"
  | "phone"
  | "iban"
  | "ssn"
  | "url";

/** Classification result returned by Touchstone for a single term. */
export interface TouchstoneResult {
  dict: string;
  match: boolean;
  type: string;
  jurisdiction: string;
  confidence: string;
  metadata: Record<string, string | number>;
}

/** A fully classified entity ready for alias generation and substitution. */
export interface Entity {
  text: string;
  start: number;
  end: number;
  type: EntityType;
  confidence: "high" | "medium" | "low";
  sources: string[];
  proposedAlias: string;
  acceptedAlias?: string;
}

export type EntityType =
  | "person"
  | "company"
  | "address"
  | "city"
  | "email"
  | "phone"
  | "iban"
  | "ssn"
  | "url"
  | "unknown";

/** Configuration for the Touchstone client. */
export interface TouchstoneConfig {
  baseUrl: string;
  timeout: number;
  maxBatchSize: number;
  jurisdictions?: string[];
}

/** Result of running the full pipeline. */
export interface PipelineResult {
  entities: Entity[];
  anonymizedText: string;
  language: string;
}

/** Pipeline options. */
export interface PipelineOptions {
  touchstone?: TouchstoneConfig;
  decoyRatio?: number;
  aliasStyle?: "realistic" | "generic";
  jurisdictions?: string[];
}
