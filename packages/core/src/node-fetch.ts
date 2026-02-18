import type { FetchPort } from "./ports.js";

/**
 * FetchPort implementation for Node.js / Bun / Deno.
 * Uses the global fetch() available in Node 18+, Bun, and Deno.
 */
export class NodeFetch implements FetchPort {
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
