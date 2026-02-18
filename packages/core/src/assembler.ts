import type {
  DetectedGroup,
  TouchstoneResult,
  Entity,
  EntityType,
} from "./types.js";
import { generateAlias } from "./alias-generator.js";

/**
 * Assemble final entities from local detection groups and Touchstone results.
 * Merges adjacent names, assigns entity types and confidence levels,
 * and generates alias proposals.
 */
export function assemble(
  groups: DetectedGroup[],
  touchstoneResults: Map<string, TouchstoneResult[]>,
  aliasMap: Map<string, string>,
  aliasStyle: "realistic" | "generic" = "realistic"
): Entity[] {
  const entities: Entity[] = [];

  for (const group of groups) {
    const entity = resolveGroup(group, touchstoneResults, aliasMap, aliasStyle);
    if (entity) entities.push(entity);
  }

  // Merge adjacent person entities (firstname + surname)
  const merged = mergeAdjacentPersons(entities, aliasMap, aliasStyle);

  return merged;
}

function resolveGroup(
  group: DetectedGroup,
  touchstoneResults: Map<string, TouchstoneResult[]>,
  aliasMap: Map<string, string>,
  aliasStyle: "realistic" | "generic"
): Entity | null {
  const start = Math.min(...group.tokens.map((t) => t.start));
  const end = Math.max(...group.tokens.map((t) => t.end));

  // Pattern-detected entities (email, phone, etc.)
  if (group.skipTouchstone && group.localType) {
    const type = mapLocalTypeToEntityType(group.localType);
    const alias = generateAlias(type, group.text, aliasMap, aliasStyle);
    return {
      text: group.text,
      start,
      end,
      type,
      confidence: "high",
      sources: [`local:${group.localType}`],
      proposedAlias: alias,
    };
  }

  // Gather Touchstone results for this group's tokens
  const sources: string[] = [];
  let touchstoneType: string | undefined;

  // Check group text first
  const groupResults = touchstoneResults.get(group.text);
  if (groupResults) {
    for (const r of groupResults) {
      if (r.match) {
        sources.push(r.dict);
        touchstoneType = r.type;
      }
    }
  }

  // Then check individual tokens
  for (const token of group.tokens) {
    const tokenResults = touchstoneResults.get(token.text);
    if (!tokenResults) continue;
    for (const r of tokenResults) {
      if (r.match) {
        sources.push(r.dict);
        if (!touchstoneType) touchstoneType = r.type;
      }
    }
  }

  // Determine final entity type and confidence
  let type: EntityType;
  let confidence: Entity["confidence"];

  if (group.localType === "company_candidate" && touchstoneType) {
    type = "company";
    confidence = "high";
  } else if (group.localType === "company_candidate") {
    type = "company";
    confidence = "medium";
  } else if (group.localType === "person_candidate" && touchstoneType) {
    type = "person";
    confidence = "high";
  } else if (group.localType === "person_candidate") {
    type = "person";
    confidence = "medium";
  } else if (group.localType === "address_fragment") {
    type = "address";
    confidence = touchstoneType ? "high" : "medium";
  } else if (
    touchstoneType === "first_name" ||
    touchstoneType === "surname"
  ) {
    type = "person";
    confidence = "medium";
  } else if (touchstoneType === "city" || touchstoneType === "commune") {
    type = "city";
    confidence = "medium";
  } else if (touchstoneType === "company") {
    type = "company";
    confidence = "medium";
  } else if (sources.length > 0) {
    type = "unknown";
    confidence = "low";
  } else {
    // No match from Touchstone, but was a candidate
    type = "unknown";
    confidence = "low";
  }

  const alias = generateAlias(type, group.text, aliasMap, aliasStyle);

  return {
    text: group.text,
    start,
    end,
    type,
    confidence,
    sources: sources.length > 0 ? sources : ["local:candidate"],
    proposedAlias: alias,
  };
}

function mapLocalTypeToEntityType(
  localType: string
): EntityType {
  switch (localType) {
    case "person_candidate":
      return "person";
    case "company_candidate":
      return "company";
    case "address_fragment":
      return "address";
    case "email":
      return "email";
    case "phone":
      return "phone";
    case "iban":
      return "iban";
    case "ssn":
      return "ssn";
    case "url":
      return "unknown";
    default:
      return "unknown";
  }
}

/** Merge adjacent person entities into single entities. */
function mergeAdjacentPersons(
  entities: Entity[],
  aliasMap: Map<string, string>,
  aliasStyle: "realistic" | "generic"
): Entity[] {
  if (entities.length < 2) return entities;

  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const merged: Entity[] = [];
  let i = 0;

  while (i < sorted.length) {
    const current = sorted[i];

    if (
      current.type === "person" &&
      i + 1 < sorted.length &&
      sorted[i + 1].type === "person"
    ) {
      const next = sorted[i + 1];
      // Check if they're adjacent (within a few chars, typically whitespace)
      if (next.start - current.end <= 3) {
        const mergedText = `${current.text} ${next.text}`;
        const alias = generateAlias("person", mergedText, aliasMap, aliasStyle);
        merged.push({
          text: mergedText,
          start: current.start,
          end: next.end,
          type: "person",
          confidence: current.confidence === "high" || next.confidence === "high"
            ? "high"
            : "medium",
          sources: [...new Set([...current.sources, ...next.sources])],
          proposedAlias: alias,
        });
        i += 2;
        continue;
      }
    }

    merged.push(current);
    i++;
  }

  return merged;
}
