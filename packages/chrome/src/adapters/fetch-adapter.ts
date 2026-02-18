// Re-export NodeFetch as BrowserFetch — they use the same global fetch() API.
// Browser automatically negotiates HTTP/2 when available.
import { NodeFetch } from "@whiteout/core";

export { NodeFetch as BrowserFetch };
