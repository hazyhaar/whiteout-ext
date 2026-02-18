import { describe, it, expect } from "vitest";
import { substitute } from "../src/substituter.js";
import type { Entity } from "../src/types.js";

describe("substitute", () => {
  it("replaces entity text with alias", () => {
    const text = "M. Dupont habite à Lyon";
    const entities: Entity[] = [
      {
        text: "Dupont",
        start: 3,
        end: 9,
        type: "person",
        confidence: "high",
        sources: ["surnames"],
        proposedAlias: "Renaud",
      },
    ];
    const result = substitute(text, entities);
    expect(result).toBe("M. Renaud habite à Lyon");
  });

  it("replaces multiple entities preserving offsets", () => {
    const text = "M. Dupont habite à Lyon";
    const entities: Entity[] = [
      {
        text: "Dupont",
        start: 3,
        end: 9,
        type: "person",
        confidence: "high",
        sources: ["surnames"],
        proposedAlias: "Renaud",
      },
      {
        text: "Lyon",
        start: 19,
        end: 23,
        type: "city",
        confidence: "medium",
        sources: ["cities"],
        proposedAlias: "Bordeaux",
      },
    ];
    const result = substitute(text, entities);
    expect(result).toBe("M. Renaud habite à Bordeaux");
  });

  it("uses acceptedAlias when available", () => {
    const text = "Dupont est parti";
    const entities: Entity[] = [
      {
        text: "Dupont",
        start: 0,
        end: 6,
        type: "person",
        confidence: "high",
        sources: ["surnames"],
        proposedAlias: "Renaud",
        acceptedAlias: "Martin",
      },
    ];
    const result = substitute(text, entities);
    expect(result).toBe("Martin est parti");
  });

  it("handles empty entity list", () => {
    const text = "Rien à anonymiser ici";
    expect(substitute(text, [])).toBe(text);
  });

  it("handles entities with different length aliases", () => {
    const text = "AB CD EF";
    const entities: Entity[] = [
      {
        text: "AB",
        start: 0,
        end: 2,
        type: "person",
        confidence: "high",
        sources: [],
        proposedAlias: "XXXX",
      },
      {
        text: "EF",
        start: 6,
        end: 8,
        type: "person",
        confidence: "high",
        sources: [],
        proposedAlias: "Y",
      },
    ];
    const result = substitute(text, entities);
    expect(result).toBe("XXXX CD Y");
  });
});
