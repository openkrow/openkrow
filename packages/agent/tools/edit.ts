/**
 * EditTool — Perform exact string replacements in files.
 *
 * Adapted from OpenCode's edit tool with multiple fallback replacement
 * strategies: exact match, line-trimmed, whitespace-normalized, and
 * indentation-flexible matching.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import * as path from "path";
import { createTool, loadDescription, ok, fail, resolveAndGuard } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "edit.txt");

// ---------------------------------------------------------------------------
// Replacer strategies (adapted from OpenCode)
// ---------------------------------------------------------------------------

type Replacer = (content: string, find: string) => Generator<string, void, unknown>;

const SimpleReplacer: Replacer = function* (_content, find) {
  yield find;
};

const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n");
  const searchLines = find.split("\n");
  if (searchLines[searchLines.length - 1] === "") searchLines.pop();

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }
    if (matches) {
      let start = 0;
      for (let k = 0; k < i; k++) start += originalLines[k].length + 1;
      let end = start;
      for (let k = 0; k < searchLines.length; k++) {
        end += originalLines[i + k].length;
        if (k < searchLines.length - 1) end += 1;
      }
      yield content.substring(start, end);
    }
  }
};

const WhitespaceNormalizedReplacer: Replacer = function* (content, find) {
  const normalize = (t: string) => t.replace(/\s+/g, " ").trim();
  const normalizedFind = normalize(find);
  const lines = content.split("\n");

  for (const line of lines) {
    if (normalize(line) === normalizedFind) yield line;
  }

  const findLines = find.split("\n");
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length);
      if (normalize(block.join("\n")) === normalizedFind) yield block.join("\n");
    }
  }
};

const IndentationFlexibleReplacer: Replacer = function* (content, find) {
  const removeIndent = (text: string) => {
    const lines = text.split("\n");
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) return text;
    const min = Math.min(...nonEmpty.map((l) => (l.match(/^(\s*)/) ?? [""])[1].length));
    return lines.map((l) => (l.trim().length === 0 ? l : l.slice(min))).join("\n");
  };

  const normalizedFind = removeIndent(find);
  const contentLines = content.split("\n");
  const findLines = find.split("\n");

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n");
    if (removeIndent(block) === normalizedFind) yield block;
  }
};

function replace(content: string, oldString: string, newString: string, replaceAll = false): string {
  if (oldString === newString) {
    throw new Error("No changes to apply: oldString and newString are identical.");
  }

  for (const replacer of [SimpleReplacer, LineTrimmedReplacer, WhitespaceNormalizedReplacer, IndentationFlexibleReplacer]) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search);
      if (index === -1) continue;

      if (replaceAll) return content.replaceAll(search, newString);

      const lastIndex = content.lastIndexOf(search);
      if (index !== lastIndex) continue;

      return content.substring(0, index) + newString + content.substring(index + search.length);
    }
  }

  if (!content.includes(oldString)) {
    throw new Error(
      "Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.",
    );
  }
  throw new Error("Found multiple matches for oldString. Provide more surrounding context to make the match unique.");
}

export function createEditTool(workspacePath?: string): Tool {
  return createTool({
    name: "edit",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "The absolute path to the file to modify",
        },
        oldString: {
          type: "string",
          description: "The text to replace",
        },
        newString: {
          type: "string",
          description: "The text to replace it with (must be different from oldString)",
        },
        replaceAll: {
          type: "boolean",
          description: "Replace all occurrences of oldString (default false)",
        },
      },
      required: ["filePath", "oldString", "newString"],
    },
    execute: async (args) => {
      const filePath = args.filePath as string;
      const oldString = args.oldString as string;
      const newString = args.newString as string;
      const replaceAllFlag = (args.replaceAll as boolean | undefined) ?? false;

      if (!filePath) return fail("filePath is required");

      let resolved: string;
      try {
        resolved = resolveAndGuard(filePath, workspacePath);
      } catch (msg) {
        return fail(msg as string);
      }

      // Empty oldString means create/overwrite (same as OpenCode)
      if (oldString === "") {
        try {
          writeFileSync(resolved, newString, "utf-8");
          return ok("Edit applied successfully.");
        } catch (err: unknown) {
          return fail(`Failed to write file: ${(err as Error).message}`);
        }
      }

      if (!existsSync(resolved)) return fail(`File not found: ${resolved}`);

      try {
        const content = readFileSync(resolved, "utf-8");
        const updated = replace(content, oldString, newString, replaceAllFlag);
        writeFileSync(resolved, updated, "utf-8");
        return ok("Edit applied successfully.");
      } catch (err: unknown) {
        return fail((err as Error).message);
      }
    },
  });
}
