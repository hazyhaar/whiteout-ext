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
});
