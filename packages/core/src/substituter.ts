import type { Entity } from "./types.js";

/**
 * Produce the anonymized text by replacing each accepted entity with its alias.
 * Replaces from end to start to preserve character offsets.
 */
export function substitute(text: string, entities: Entity[]): string {
  // Sort by start offset descending so replacements don't shift later offsets
  const sorted = [...entities].sort((a, b) => b.start - a.start);

  let result = text;
  for (const entity of sorted) {
    const alias = entity.acceptedAlias ?? entity.proposedAlias;
    result = result.slice(0, entity.start) + alias + result.slice(entity.end);
  }

  return result;
}
