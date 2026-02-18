import { pipeline } from "./index.js";
import { MemoryStore } from "./ports.js";
import { NodeFetch } from "./node-fetch.js";
import type { PipelineResult, PipelineOptions, Entity, EntityType } from "./types.js";
import type { FetchPort, StorePort } from "./ports.js";

/**
 * Options for the simplified anonymize() API.
 * Designed for library consumers who want zero-config usage.
 */
export interface AnonymizeOptions {
  /** Touchstone server URL. Default: http://localhost:8420. Set to null to force offline mode. */
  touchstoneUrl?: string | null;
  /** Request timeout in ms. Default: 5000. */
  timeout?: number;
  /** Decoy ratio (0-1). Default: 0.35. */
  decoyRatio?: number;
  /** Alias style. Default: "realistic". */
  aliasStyle?: "realistic" | "generic";
  /** Jurisdictions to query. Default: auto-detect from text language. */
  jurisdictions?: string[];
  /** Session ID for alias consistency across multiple calls. Default: auto-generated. */
  sessionId?: string;
  /** Custom FetchPort (for environments without global fetch). */
  fetchPort?: FetchPort;
  /** Custom StorePort (for persistent cache/aliases). */
  store?: StorePort;
}

/** Simplified result with the essentials. */
export interface AnonymizeResult {
  /** The anonymized text. */
  text: string;
  /** Detected entities with their aliases. */
  entities: Entity[];
  /** Detected language code. */
  language: string;
  /** Alias lookup table (original → alias). */
  aliasTable: Record<string, string>;
}

// Shared state for the default session
let defaultStore: MemoryStore | null = null;
let sessionCounter = 0;

/**
 * Anonymize a text document in one call.
 *
 * Zero-config: works offline out of the box.
 * With Touchstone: provide touchstoneUrl for dictionary-based classification.
 *
 * @example
 * ```ts
 * import { anonymize } from '@whiteout/core/anonymize'
 *
 * // Offline mode (local detection only)
 * const result = await anonymize("M. Dupont habite à Lyon.")
 * console.log(result.text) // "M. Renaud habite à Bordeaux."
 *
 * // With Touchstone
 * const result = await anonymize("M. Dupont habite à Lyon.", {
 *   touchstoneUrl: "http://localhost:8420"
 * })
 *
 * // In an AI pipeline
 * const clean = await anonymize(userDocument)
 * const response = await llm.chat(clean.text)
 * ```
 */
export async function anonymize(
  text: string,
  options: AnonymizeOptions = {}
): Promise<AnonymizeResult> {
  const store = options.store ?? getDefaultStore();
  const sessionId = options.sessionId ?? `lib_${++sessionCounter}`;

  let fetchPort: FetchPort;
  if (options.fetchPort) {
    fetchPort = options.fetchPort;
  } else if (options.touchstoneUrl === null) {
    // Force offline mode
    fetchPort = offlineFetch;
  } else {
    fetchPort = new NodeFetch(options.timeout ?? 5000);
  }

  const pipelineOptions: PipelineOptions = {
    touchstone: options.touchstoneUrl !== null
      ? {
          baseUrl: options.touchstoneUrl ?? "http://localhost:8420",
          timeout: options.timeout ?? 5000,
          maxBatchSize: 100,
          jurisdictions: options.jurisdictions,
        }
      : undefined,
    decoyRatio: options.decoyRatio ?? 0.35,
    aliasStyle: options.aliasStyle ?? "realistic",
    jurisdictions: options.jurisdictions,
  };

  const result = await pipeline(text, fetchPort, store, sessionId, pipelineOptions);

  // Build alias table
  const aliasTable: Record<string, string> = {};
  for (const entity of result.entities) {
    aliasTable[entity.text] = entity.acceptedAlias ?? entity.proposedAlias;
  }

  return {
    text: result.anonymizedText,
    entities: result.entities,
    language: result.language,
    aliasTable,
  };
}

/**
 * Anonymize multiple documents with consistent aliases across all of them.
 *
 * @example
 * ```ts
 * const results = await anonymizeBatch([doc1, doc2, doc3])
 * // "Dupont" gets the same alias in all three documents
 * ```
 */
export async function anonymizeBatch(
  texts: string[],
  options: AnonymizeOptions = {}
): Promise<AnonymizeResult[]> {
  const sessionId = options.sessionId ?? `batch_${++sessionCounter}`;
  const results: AnonymizeResult[] = [];

  for (const text of texts) {
    results.push(await anonymize(text, { ...options, sessionId }));
  }

  return results;
}

/**
 * Restore original text using an alias table.
 * Useful for de-anonymizing after processing.
 *
 * @example
 * ```ts
 * const { text, aliasTable } = await anonymize(document)
 * const aiResponse = await llm.chat(text)
 * const restored = deanonymize(aiResponse, aliasTable)
 * ```
 */
export function deanonymize(
  anonymizedText: string,
  aliasTable: Record<string, string>
): string {
  // Invert the alias table
  const reverseMap = new Map<string, string>();
  for (const [original, alias] of Object.entries(aliasTable)) {
    reverseMap.set(alias, original);
  }

  // Sort by alias length descending to replace longer aliases first
  const aliases = [...reverseMap.entries()].sort(
    ([a], [b]) => b.length - a.length
  );

  let result = anonymizedText;
  for (const [alias, original] of aliases) {
    // Replace all occurrences
    result = result.split(alias).join(original);
  }

  return result;
}

function getDefaultStore(): MemoryStore {
  if (!defaultStore) {
    defaultStore = new MemoryStore();
  }
  return defaultStore;
}

const offlineFetch: FetchPort = {
  async post(): Promise<{ status: number; body: string }> {
    throw new Error("Offline mode");
  },
};
