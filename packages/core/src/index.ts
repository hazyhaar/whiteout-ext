export type {
  Token,
  PatternType,
  DetectedGroup,
  LocalType,
  TouchstoneResult,
  TouchstoneConfig,
  Entity,
  EntityType,
  PipelineResult,
  PipelineOptions,
} from "./types.js";

export type { StorePort, FetchPort } from "./ports.js";
export { MemoryStore } from "./ports.js";

export { tokenize } from "./tokenizer.js";
export { detectLocal, detectLanguage } from "./local-detector.js";
export { mixDecoys } from "./decoy-mixer.js";
export { classifyBatch } from "./touchstone-client.js";
export { assemble } from "./assembler.js";
export { generateAlias, resetAliasCounters } from "./alias-generator.js";
export { substitute } from "./substituter.js";

import { tokenize } from "./tokenizer.js";
import { detectLocal, detectLanguage } from "./local-detector.js";
import { classifyBatch } from "./touchstone-client.js";
import { assemble } from "./assembler.js";
import { resetAliasCounters } from "./alias-generator.js";
import { substitute } from "./substituter.js";
import type { PipelineResult, PipelineOptions } from "./types.js";
import type { FetchPort, StorePort } from "./ports.js";

/**
 * Run the full Whiteout anonymization pipeline.
 *
 * text in → tokenize → detect locally → classify via Touchstone →
 * assemble entities → generate aliases → substitute → anonymized text out
 */
export async function pipeline(
  text: string,
  fetchPort: FetchPort,
  store: StorePort,
  sessionId: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  // Reset alias counters for generic style
  resetAliasCounters();

  // Load existing alias map for session consistency
  const aliasMap = await store.getAliasMap(sessionId);

  // Step 1: Tokenize
  const tokens = tokenize(text);

  // Step 2: Detect language
  const language = detectLanguage(tokens);

  // Step 3: Local detection
  const groups = detectLocal(tokens);

  // Step 4: Classify via Touchstone (with decoys)
  const touchstoneResults = await classifyBatch(
    groups,
    fetchPort,
    store,
    {
      ...options.touchstone,
      jurisdictions: options.jurisdictions ?? [language],
    },
    options.decoyRatio ?? 0.35
  );

  // Step 5: Assemble entities
  const entities = assemble(
    groups,
    touchstoneResults,
    aliasMap,
    options.aliasStyle ?? "realistic"
  );

  // Step 6: Persist alias map
  await store.setAliasMap(sessionId, aliasMap);

  // Step 7: Substitute
  const anonymizedText = substitute(text, entities);

  return { entities, anonymizedText, language };
}
