import firstnames from "../data/alias-firstnames.json" with { type: "json" };
import surnames from "../data/alias-surnames.json" with { type: "json" };
import companies from "../data/alias-companies.json" with { type: "json" };

const ALL_FIRSTNAMES = [
  ...firstnames.M,
  ...firstnames.F,
  ...firstnames.neutral,
];

/**
 * Mix real candidate terms with decoy terms and shuffle.
 * Returns a shuffled array. The caller must track which terms are real.
 *
 * Decoy count is computed so that real + decoys ≤ maxBatch.
 * Real terms are NEVER dropped — only the decoy count is reduced.
 */
export function mixDecoys(
  realTerms: string[],
  ratio: number = 0.35,
  maxBatch: number = 100
): { mixed: string[]; realSet: Set<string> } {
  const realSet = new Set(realTerms);

  // Ensure we never exceed maxBatch, and never drop real terms
  const availableForDecoys = Math.max(0, maxBatch - realTerms.length);
  const desiredDecoys = Math.ceil(realTerms.length * ratio);
  const decoyCount = Math.min(desiredDecoys, availableForDecoys);
  const decoys: string[] = [];

  for (let i = 0; i < decoyCount; i++) {
    decoys.push(generateDecoy());
  }

  const mixed = [...realTerms, ...decoys];
  fisherYatesShuffle(mixed);

  return { mixed, realSet };
}

function generateDecoy(): string {
  const roll = cryptoRandom();
  if (roll < 0.4) {
    return pickRandom(ALL_FIRSTNAMES);
  } else if (roll < 0.7) {
    return pickRandom(surnames);
  } else {
    return pickRandom(companies.standalone);
  }
}

/** Crypto-safe random float in [0, 1). */
function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / (0xffffffff + 1);
}

function pickRandom<T>(arr: readonly T[]): T {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return arr[buf[0] % arr.length];
}

function fisherYatesShuffle<T>(arr: T[]): void {
  const buf = new Uint32Array(arr.length);
  crypto.getRandomValues(buf);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = buf[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
