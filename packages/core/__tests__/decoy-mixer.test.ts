import { describe, it, expect } from "vitest";
import { mixDecoys } from "../src/decoy-mixer.js";

describe("mixDecoys", () => {
  it("adds decoys to real terms", () => {
    const real = ["Dupont", "Lyon", "SCI Les Lilas"];
    const { mixed, realSet } = mixDecoys(real, 0.5);
    expect(mixed.length).toBeGreaterThan(real.length);
    expect(realSet.size).toBe(3);
  });

  it("preserves all real terms in the result", () => {
    const real = ["Dupont", "Martin", "Paris"];
    const { mixed, realSet } = mixDecoys(real, 0.3);
    for (const term of real) {
      expect(mixed).toContain(term);
    }
  });

  it("respects max batch size", () => {
    const real = Array.from({ length: 80 }, (_, i) => `Term${i}`);
    const { mixed } = mixDecoys(real, 0.5, 100);
    expect(mixed.length).toBeLessThanOrEqual(100);
  });

  it("shuffles the output", () => {
    // With enough terms, the output should not be in the same order
    const real = Array.from({ length: 20 }, (_, i) => `Term${i}`);
    const { mixed: mix1 } = mixDecoys(real, 0.3);
    const { mixed: mix2 } = mixDecoys(real, 0.3);
    // Very unlikely both are identical (shuffled)
    const sameOrder = mix1.every((v, i) => v === mix2[i]);
    // This could theoretically fail, but the probability is astronomically low
    expect(sameOrder).toBe(false);
  });

  it("handles empty input", () => {
    const { mixed } = mixDecoys([], 0.3);
    expect(mixed).toEqual([]);
  });

  it("never drops real terms when batch is full", () => {
    // 90 real terms + 35% decoys = 122 > maxBatch=100
    // Decoy count should be reduced, not real terms dropped
    const real = Array.from({ length: 90 }, (_, i) => `RealTerm${i}`);
    const { mixed, realSet } = mixDecoys(real, 0.35, 100);

    // All 90 real terms must be present
    for (const term of real) {
      expect(mixed).toContain(term);
    }
    expect(mixed.length).toBeLessThanOrEqual(100);
    // Decoys fill remaining space: 100 - 90 = 10
    const decoyCount = mixed.filter((t) => !realSet.has(t)).length;
    expect(decoyCount).toBeLessThanOrEqual(10);
  });
});
