/**
 * WebSearchTool — Search the web using DuckDuckGo HTML scraping.
 *
 * No API key required. Scrapes DuckDuckGo's HTML search results page
 * and extracts titles, URLs, and snippets.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const RAW_DESCRIPTION = loadDescription(import.meta.url, "websearch.txt");

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Parse DuckDuckGo HTML search results.
 * DDG uses <a class="result__a"> for titles/links and
 * <a class="result__snippet"> for snippets.
 */
function parseDDGResults(html: string, max: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks — DDG wraps each result in a div with class "result"
  const resultPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  const titles: { url: string; title: string }[] = [];
  let match;

  while ((match = resultPattern.exec(html)) !== null && titles.length < max) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();

    // DDG redirects through uddg param
    let url = rawUrl;
    const uddg = rawUrl.match(/uddg=([^&]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);

    if (title && url) titles.push({ url, title });
  }

  const snippets: string[] = [];
  while ((match = snippetPattern.exec(html)) !== null) {
    snippets.push(match[1].replace(/<[^>]+>/g, "").trim());
  }

  for (let i = 0; i < titles.length; i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

export function createWebSearchTool(): Tool {
  const description = RAW_DESCRIPTION.replace("${date}", new Date().toISOString().split("T")[0]);

  return createTool({
    name: "websearch",
    description,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        numResults: {
          type: "number",
          description: "Number of search results to return (default: 8)",
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = args.query as string;
      const numResults = (args.numResults as number | undefined) ?? 8;

      if (!query) return fail("query is required");

      try {
        const encoded = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

        const response = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            Accept: "text/html",
            "Accept-Language": "en-US,en;q=0.9",
          },
        });

        if (!response.ok) {
          return fail(`Search failed: HTTP ${response.status}`);
        }

        const html = await response.text();
        const results = parseDDGResults(html, numResults);

        if (results.length === 0) {
          return ok("No search results found. Try a different query.");
        }

        const output = results
          .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
          .join("\n\n");

        return ok(`Search results for "${query}":\n\n${output}`);
      } catch (err: unknown) {
        return fail(`Search failed: ${(err as Error).message}`);
      }
    },
  });
}
