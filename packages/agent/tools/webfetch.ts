/**
 * WebFetchTool — Fetch content from a URL and return it as text, markdown, or HTML.
 *
 * Uses the built-in fetch API. Converts HTML to a simple text representation
 * when markdown format is requested.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "webfetch.txt");

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;

/**
 * Naive HTML-to-text conversion. Strips tags, decodes common entities,
 * collapses whitespace. For full markdown conversion the caller can
 * integrate turndown or a similar library.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createWebFetchTool(): Tool {
  return createTool({
    name: "webfetch",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch content from" },
        format: {
          type: "string",
          enum: ["text", "markdown", "html"],
          description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
        },
        timeout: { type: "number", description: "Optional timeout in seconds (max 120)" },
      },
      required: ["url"],
    },
    execute: async (args) => {
      const url = args.url as string;
      const format = (args.format as string | undefined) ?? "markdown";
      const timeoutSecs = args.timeout as number | undefined;

      if (!url) return fail("url is required");
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return fail("URL must start with http:// or https://");
      }

      const timeout = Math.min((timeoutSecs ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        clearTimeout(timer);

        if (!response.ok) {
          return fail(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
          return fail("Response too large (exceeds 5MB limit)");
        }

        const text = await response.text();
        if (text.length > MAX_RESPONSE_SIZE) {
          return fail("Response too large (exceeds 5MB limit)");
        }

        const contentType = response.headers.get("content-type") ?? "";

        if (format === "html") {
          return ok(text);
        }

        if (format === "text" || format === "markdown") {
          if (contentType.includes("text/html")) {
            return ok(htmlToText(text));
          }
          return ok(text);
        }

        return ok(text);
      } catch (err: unknown) {
        const message = (err as Error).message;
        if (message.includes("abort")) return fail("Request timed out");
        return fail(`Fetch failed: ${message}`);
      }
    },
  });
}
