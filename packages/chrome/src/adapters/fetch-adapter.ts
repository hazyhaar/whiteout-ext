import type { FetchPort } from "@whiteout/core";

/**
 * Browser fetch-based implementation of FetchPort.
 * Uses HTTP/2 when available (browser handles protocol negotiation).
 */
export class BrowserFetch implements FetchPort {
  private timeout: number;

  constructor(timeout = 5000) {
    this.timeout = timeout;
  }

  async post(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      const text = await response.text();
      return { status: response.status, body: text };
    } finally {
      clearTimeout(timer);
    }
  }
}
