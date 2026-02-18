/**
 * Bundle entry point for IIFE/ESM builds.
 * Exposes a flat API suitable for calling from native bridges
 * (Kotlin JNI, Swift JSContext, etc.)
 *
 * In IIFE mode, everything is available as `Whiteout.*`:
 *   const result = await Whiteout.anonymize("M. Dupont habite à Lyon.")
 *   const restored = Whiteout.deanonymize(result.text, result.aliasTable)
 */

// Re-export the simplified API
export { anonymize, anonymizeBatch, deanonymize } from "./anonymize.js";
export type { AnonymizeOptions, AnonymizeResult } from "./anonymize.js";

// Re-export individual modules for advanced use
export { tokenize } from "./tokenizer.js";
export { detectLocal, detectLanguage } from "./local-detector.js";
export { assemble } from "./assembler.js";
export { generateAlias, resetAliasCounters } from "./alias-generator.js";
export { substitute } from "./substituter.js";
export { pipeline } from "./index.js";
export { MemoryStore } from "./ports.js";

// Re-export types
export type {
  Token,
  Entity,
  EntityType,
  PipelineResult,
  PipelineOptions,
  TouchstoneConfig,
} from "./types.js";
export type { StorePort, FetchPort } from "./ports.js";
