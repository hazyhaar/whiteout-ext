import { describe, it, expect } from "vitest";
import { tokenize } from "../src/tokenizer.js";

describe("tokenize", () => {
  it("splits simple words", () => {
    const tokens = tokenize("Bonjour le monde");
    const words = tokens.filter((t) => t.kind === "word");
    expect(words.map((t) => t.text)).toEqual(["Bonjour", "le", "monde"]);
  });

  it("preserves character offsets", () => {
    const tokens = tokenize("Hello world");
    const words = tokens.filter((t) => t.kind === "word");
    expect(words[0]).toMatchObject({ text: "Hello", start: 0, end: 5 });
    expect(words[1]).toMatchObject({ text: "world", start: 6, end: 11 });
  });

  it("detects email addresses", () => {
    const tokens = tokenize("Contact jean.dupont@gmail.com pour info");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      text: "jean.dupont@gmail.com",
      patternType: "email",
    });
  });

  it("detects French phone numbers", () => {
    const tokens = tokenize("Appelez le 06 12 34 56 78 rapidement");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("phone");
  });

  it("detects French phone with international prefix", () => {
    const tokens = tokenize("Tel: +33 6 12 34 56 78");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("phone");
  });

  it("detects IBAN", () => {
    const tokens = tokenize("IBAN: FR76 1234 5678 9012 3456 7890 123");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("iban");
  });

  it("detects French SSN (NIR)", () => {
    const tokens = tokenize("NIR: 1 85 05 78 006 084 22");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("ssn_fr");
  });

  it("detects French SSN with Corsica department (2A/2B)", () => {
    const tokens = tokenize("NIR: 2 92 03 2A 123 456 78");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("ssn_fr");
  });

  it("detects URLs", () => {
    const tokens = tokenize("Voir https://example.com/page?q=1 pour plus");
    const patterns = tokens.filter((t) => t.kind === "pattern");
    expect(patterns).toHaveLength(1);
    expect(patterns[0].patternType).toBe("url");
  });

  it("handles hyphenated names", () => {
    const tokens = tokenize("Jean-Pierre est là");
    const words = tokens.filter((t) => t.kind === "word");
    expect(words[0].text).toBe("Jean-Pierre");
  });

  it("handles numbers", () => {
    const tokens = tokenize("12 rue des Acacias");
    expect(tokens[0]).toMatchObject({ text: "12", kind: "number" });
  });

  it("handles punctuation", () => {
    const tokens = tokenize("Bonjour, M. Dupont.");
    const puncts = tokens.filter((t) => t.kind === "punctuation");
    expect(puncts.length).toBeGreaterThanOrEqual(2);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});
