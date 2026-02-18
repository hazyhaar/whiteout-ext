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
 */
export function mixDecoys(
  realTerms: string[],
  ratio: number = 0.35,
  maxBatch: number = 100
): { mixed: string[]; realSet: Set<string> } {
  const realSet = new Set(realTerms);
  const decoyCount = Math.ceil(realTerms.length * ratio);
  const decoys: string[] = [];

  for (let i = 0; i < decoyCount; i++) {
    decoys.push(generateDecoy());
  }

  const mixed = [...realTerms, ...decoys];
  fisherYatesShuffle(mixed);

  // Cap at max batch size
  if (mixed.length > maxBatch) {
    mixed.length = maxBatch;
  }

  return { mixed, realSet };
}

function generateDecoy(): string {
  const roll = Math.random();
  if (roll < 0.4) {
    // Random name
    return pickRandom(ALL_FIRSTNAMES);
  } else if (roll < 0.7) {
    // Random surname
    return pickRandom(surnames);
  } else {
    // Random company fragment
    return pickRandom(companies.standalone);
  }
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fisherYatesShuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
