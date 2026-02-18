import type {
  TouchstoneConfig,
  TouchstoneResult,
  DetectedGroup,
} from "./types.js";
import type { FetchPort, StorePort } from "./ports.js";
import { mixDecoys } from "./decoy-mixer.js";

const DEFAULT_CONFIG: TouchstoneConfig = {
  baseUrl: "http://localhost:8420",
  timeout: 5000,
  maxBatchSize: 100,
};

/**
 * Classify candidate terms via the Touchstone service.
 *
 * Uses ConnectRPC-style POST with JSON content type over HTTP/2 when available.
 * The endpoint follows the Connect protocol: POST to the fully-qualified
 * method path with a JSON body, receiving a JSON response.
 *
 * Falls back gracefully to REST when Connect is not available.
 */
export async function classifyBatch(
  groups: DetectedGroup[],
  fetchPort: FetchPort,
  store: StorePort,
  config: Partial<TouchstoneConfig> = {},
  decoyRatio: number = 0.35
): Promise<Map<string, TouchstoneResult[]>> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const results = new Map<string, TouchstoneResult[]>();

  // Collect unique terms that need Touchstone classification
  const termsToClassify: string[] = [];
  for (const group of groups) {
    if (group.skipTouchstone) continue;
    // Check cache first
    const cached = await store.getCachedClassification(group.text);
    if (cached) {
      results.set(group.text, cached);
      continue;
    }
    // Also try individual tokens for multi-word groups
    for (const token of group.tokens) {
      if (token.kind === "word" && !results.has(token.text)) {
        const cachedToken = await store.getCachedClassification(token.text);
        if (cachedToken) {
          results.set(token.text, cachedToken);
        } else {
          termsToClassify.push(token.text);
        }
      }
    }
  }

  if (termsToClassify.length === 0) return results;

  // Deduplicate
  const uniqueTerms = [...new Set(termsToClassify)];

  // Split into batches if terms exceed maxBatchSize
  // Each batch gets its own decoys mixed in
  const batches = splitIntoBatches(uniqueTerms, cfg.maxBatchSize, decoyRatio);

  let useRest = false;

  for (const batchTerms of batches) {
    const { mixed, realSet } = mixDecoys(batchTerms, decoyRatio, cfg.maxBatchSize);

    try {
      if (!useRest) {
        // ConnectRPC-style call
        const connectUrl = `${cfg.baseUrl}/touchstone.v1.ClassificationService/ClassifyBatch`;
        const body = JSON.stringify({
          terms: mixed,
          jurisdictions: cfg.jurisdictions ?? [],
        });

        const response = await fetchPort.post(connectUrl, body, {
          "Content-Type": "application/json",
        });

        if (response.status === 404) {
          useRest = true;
          await classifyBatchRest(mixed, realSet, fetchPort, store, cfg, results);
          continue;
        }

        if (response.status !== 200) {
          console.warn(`Touchstone returned ${response.status}, using offline mode`);
          return results;
        }

        parseAndStoreResults(response.body, realSet, results, store);
      } else {
        await classifyBatchRest(mixed, realSet, fetchPort, store, cfg, results);
      }
    } catch {
      console.warn("Touchstone batch failed, skipping to next batch");
      continue;
    }
  }

  return results;
}

/**
 * Split terms into batches, reserving room for decoys in each batch.
 */
function splitIntoBatches(
  terms: string[],
  maxBatch: number,
  decoyRatio: number
): string[][] {
  // Each batch: realTerms + decoys ≤ maxBatch
  // realTerms ≤ maxBatch / (1 + decoyRatio)
  const maxReal = Math.max(1, Math.floor(maxBatch / (1 + decoyRatio)));
  const batches: string[][] = [];

  for (let i = 0; i < terms.length; i += maxReal) {
    batches.push(terms.slice(i, i + maxReal));
  }

  return batches;
}

/** Parse the ConnectRPC / REST response and store results. */
async function parseAndStoreResults(
  body: string,
  realSet: Set<string>,
  results: Map<string, TouchstoneResult[]>,
  store: StorePort
): Promise<void> {
  const raw = JSON.parse(body) as {
    classifications: Record<string, { results?: TouchstoneResult[] } | TouchstoneResult[]>;
  };

  for (const [term, termValue] of Object.entries(raw.classifications)) {
    if (!realSet.has(term)) continue;
    const termResults = Array.isArray(termValue)
      ? termValue
      : (termValue.results ?? []);
    results.set(term, termResults);
    await store.setCachedClassification(term, termResults, 24 * 60 * 60 * 1000);
  }
}

/** REST fallback for older Touchstone deployments. */
async function classifyBatchRest(
  mixed: string[],
  realSet: Set<string>,
  fetchPort: FetchPort,
  store: StorePort,
  cfg: TouchstoneConfig,
  results: Map<string, TouchstoneResult[]>
): Promise<Map<string, TouchstoneResult[]>> {
  try {
    const url = `${cfg.baseUrl}/v1/classify/batch`;
    const body = JSON.stringify({
      terms: mixed,
      jurisdictions: cfg.jurisdictions ?? [],
    });

    const response = await fetchPort.post(url, body, {
      "Content-Type": "application/json",
    });

    if (response.status !== 200) {
      console.warn(`Touchstone REST returned ${response.status}`);
      return results;
    }

    await parseAndStoreResults(response.body, realSet, results, store);
  } catch {
    console.warn("Touchstone REST fallback also failed");
  }

  return results;
}
