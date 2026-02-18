import { describe, it, expect } from "vitest";
import { assemble } from "../src/assembler.js";
import type { DetectedGroup, TouchstoneResult } from "../src/types.js";

describe("assemble", () => {
  it("creates entity from local company detection + touchstone confirm", () => {
    const groups: DetectedGroup[] = [
      {
        tokens: [
          { text: "SCI", start: 0, end: 3, kind: "word" },
          { text: "Lilas", start: 4, end: 9, kind: "word" },
        ],
        text: "SCI Lilas",
        localType: "company_candidate",
        confidence: "probable",
        skipTouchstone: false,
      },
    ];
    const touchstone = new Map<string, TouchstoneResult[]>();
    touchstone.set("Lilas", [
      {
        dict: "company_names",
        match: true,
        type: "company",
        jurisdiction: "fr",
        confidence: "high",
        metadata: {},
      },
    ]);

    const aliasMap = new Map<string, string>();
    const entities = assemble(groups, touchstone, aliasMap);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe("company");
    expect(entities[0].confidence).toBe("high");
    expect(entities[0].proposedAlias).toBeTruthy();
  });

  it("creates entity from pattern detection (email)", () => {
    const groups: DetectedGroup[] = [
      {
        tokens: [
          { text: "test@example.com", start: 0, end: 16, kind: "pattern", patternType: "email" },
        ],
        text: "test@example.com",
        localType: "email",
        confidence: "certain",
        skipTouchstone: true,
      },
    ];

    const aliasMap = new Map<string, string>();
    const entities = assemble(groups, new Map(), aliasMap);
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe("email");
    expect(entities[0].confidence).toBe("high");
  });

  it("merges adjacent person entities", () => {
    const groups: DetectedGroup[] = [
      {
        tokens: [{ text: "Jean", start: 0, end: 4, kind: "word" }],
        text: "Jean",
        confidence: "candidate",
        skipTouchstone: false,
      },
      {
        tokens: [{ text: "Dupont", start: 5, end: 11, kind: "word" }],
        text: "Dupont",
        confidence: "candidate",
        skipTouchstone: false,
      },
    ];
    const touchstone = new Map<string, TouchstoneResult[]>();
    touchstone.set("Jean", [
      { dict: "firstnames", match: true, type: "first_name", jurisdiction: "fr", confidence: "high", metadata: {} },
    ]);
    touchstone.set("Dupont", [
      { dict: "surnames", match: true, type: "surname", jurisdiction: "fr", confidence: "high", metadata: {} },
    ]);

    const aliasMap = new Map<string, string>();
    const entities = assemble(groups, touchstone, aliasMap);
    // Should merge into one person entity
    const persons = entities.filter((e) => e.type === "person");
    expect(persons).toHaveLength(1);
    expect(persons[0].text).toBe("Jean Dupont");
  });

  it("maintains alias consistency via aliasMap", () => {
    const groups: DetectedGroup[] = [
      {
        tokens: [{ text: "Dupont", start: 0, end: 6, kind: "word" }],
        text: "Dupont",
        confidence: "candidate",
        skipTouchstone: false,
      },
    ];

    const aliasMap = new Map<string, string>();
    aliasMap.set("Dupont", "Renaud");

    const entities = assemble(groups, new Map(), aliasMap);
    expect(entities[0].proposedAlias).toBe("Renaud");
  });
});
