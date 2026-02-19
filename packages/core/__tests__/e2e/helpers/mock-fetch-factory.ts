/**
 * Mock FetchPort factory — builds a FetchPort from golden.db classifications.
 *
 * Same response shape as the real Touchstone ConnectRPC endpoint but driven
 * entirely by the mock_touchstone table rows for a given scenario.
 */

import type { FetchPort } from "../../../src/ports.js";

interface MockClassification {
  dict: string;
  match: boolean;
  type: string;
  jurisdiction: string;
  confidence: string;
  metadata: Record<string, string | number>;
}

/**
 * Creates a FetchPort that responds with the given classifications.
 * Optionally tracks the number of calls made via the returned counter.
 */
export function createMockFetchFromGolden(
  classifications: Record<string, MockClassification[]>
): { fetchPort: FetchPort; callCount: () => number } {
  let calls = 0;

  const fetchPort: FetchPort = {
    async post(_url: string, body: string) {
      calls++;
      const req = JSON.parse(body) as { terms: string[] };
      const results: Record<string, unknown[]> = {};
      for (const term of req.terms) {
        if (classifications[term]) {
          results[term] = classifications[term];
        }
      }
      return {
        status: 200,
        body: JSON.stringify({ classifications: results }),
      };
    },
  };

  return { fetchPort, callCount: () => calls };
}

/**
 * A FetchPort that throws on any call (offline mode).
 * Also tracks whether it was called.
 */
export function createOfflineFetch(): { fetchPort: FetchPort; callCount: () => number } {
  let calls = 0;

  const fetchPort: FetchPort = {
    async post(): Promise<{ status: number; body: string }> {
      calls++;
      throw new Error("Offline mode — Touchstone should not be called");
    },
  };

  return { fetchPort, callCount: () => calls };
}
