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

  // Mix with decoys
  const { mixed, realSet } = mixDecoys(uniqueTerms, decoyRatio, cfg.maxBatchSize);

  try {
    // ConnectRPC-style call: POST to the RPC method path with JSON body.
    // This follows the Connect protocol over HTTP/2.
    // The endpoint path is: /touchstone.v1.ClassificationService/ClassifyBatch
    const connectUrl = `${cfg.baseUrl}/touchstone.v1.ClassificationService/ClassifyBatch`;
    const body = JSON.stringify({
      terms: mixed,
      jurisdictions: cfg.jurisdictions ?? [],
    });

    const response = await fetchPort.post(connectUrl, body, {
      "Content-Type": "application/json",
    });

    if (response.status === 404) {
      // ConnectRPC endpoint not found, fall back to REST
      return classifyBatchRest(mixed, realSet, fetchPort, store, cfg, results);
    }

    if (response.status !== 200) {
      console.warn(`Touchstone returned ${response.status}, using offline mode`);
      return results;
    }

    const data = JSON.parse(response.body) as {
      classifications: Record<string, TouchstoneResult[]>;
    };

    // Store results, filtering out decoys
    for (const [term, termResults] of Object.entries(data.classifications)) {
      if (realSet.has(term)) {
        results.set(term, termResults);
        await store.setCachedClassification(term, termResults, 24 * 60 * 60 * 1000);
      }
    }
  } catch {
    // Touchstone unreachable — offline mode, return what we have
    console.warn("Touchstone unreachable, continuing in offline mode");
  }

  return results;
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

    const data = JSON.parse(response.body) as {
      classifications: Record<string, TouchstoneResult[]>;
    };

    for (const [term, termResults] of Object.entries(data.classifications)) {
      if (realSet.has(term)) {
        results.set(term, termResults);
        await store.setCachedClassification(term, termResults, 24 * 60 * 60 * 1000);
      }
    }
  } catch {
    console.warn("Touchstone REST fallback also failed");
  }

  return results;
}
