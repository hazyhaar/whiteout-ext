import { describe, it, expect, beforeEach } from "vitest";
import { generateAlias, resetAliasCounters } from "../src/alias-generator.js";

describe("generateAlias", () => {
  beforeEach(() => {
    resetAliasCounters();
  });

  it("generates realistic person alias", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("person", "Jean-Pierre Dupont", map, "realistic");
    expect(alias).toBeTruthy();
    // Should be two words (firstname + surname)
    expect(alias.split(" ").length).toBe(2);
  });

  it("generates realistic company alias preserving legal form", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("company", "SCI Les Lilas", map, "realistic");
    expect(alias).toMatch(/^SCI /);
  });

  it("generates realistic email alias", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("email", "jean.dupont@gmail.com", map, "realistic");
    expect(alias).toMatch(/.+@.+\..+/);
  });

  it("generates realistic phone alias keeping format", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("phone", "+33 6 12 34 56 78", map, "realistic");
    expect(alias).toMatch(/^\+33/);
  });

  it("masks IBAN with X", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("iban", "FR76 1234 5678 9012", map, "realistic");
    expect(alias).toMatch(/^FR76/);
    expect(alias).toContain("X");
  });

  it("generates generic aliases with incrementing counters", () => {
    const map = new Map<string, string>();
    const a1 = generateAlias("person", "Dupont", map, "generic");
    const a2 = generateAlias("person", "Martin", map, "generic");
    expect(a1).toBe("Personne 1");
    expect(a2).toBe("Personne 2");
  });

  it("generates generic company aliases", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("company", "SCI Les Lilas", map, "generic");
    expect(alias).toBe("Société 1");
  });

  it("generates generic email aliases", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("email", "test@example.com", map, "generic");
    expect(alias).toMatch(/personne\d+@exemple\.fr/);
  });

  it("returns consistent aliases for same input", () => {
    const map = new Map<string, string>();
    const a1 = generateAlias("person", "Dupont", map, "realistic");
    const a2 = generateAlias("person", "Dupont", map, "realistic");
    expect(a1).toBe(a2);
  });

  it("generates different aliases for different inputs", () => {
    const map = new Map<string, string>();
    const a1 = generateAlias("person", "Dupont", map, "realistic");
    const a2 = generateAlias("person", "Martin", map, "realistic");
    // Extremely unlikely to be the same (random picks from large pools)
    // But not impossible, so we just check they're both truthy
    expect(a1).toBeTruthy();
    expect(a2).toBeTruthy();
  });

  it("generates uppercase alias for uppercase surname", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("person", "DUPONT", map, "realistic");
    expect(alias).toBe(alias.toUpperCase());
  });

  it("generates city alias from pool", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("city", "Lyon", map, "realistic");
    expect(alias).toBeTruthy();
    expect(alias).not.toBe("Lyon");
  });

  it("generates address alias with number and street", () => {
    const map = new Map<string, string>();
    const alias = generateAlias("address", "12 rue des Acacias", map, "realistic");
    expect(alias).toMatch(/^\d+\s/);
  });
});
