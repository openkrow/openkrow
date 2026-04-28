/**
 * ReadTool — Read files and directories from the local filesystem.
 *
 * Adapted from OpenCode's read tool pattern with line-numbered output,
 * offset/limit pagination, and directory listing support.
 */

import { readFileSync, readdirSync, statSync, createReadStream } from "fs";
import { createInterface } from "readline";
import * as path from "path";
import { createTool, loadDescription, ok, fail, resolveAndGuard } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "read.txt");

const DEFAULT_READ_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;
const MAX_BYTES = 50 * 1024;

async function readLines(
  filepath: string,
  opts: { limit: number; offset: number },
): Promise<{ raw: string[]; count: number; cut: boolean; more: boolean; offset: number }> {
  const stream = createReadStream(filepath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  const start = opts.offset - 1;
  const raw: string[] = [];
  let bytes = 0;
  let count = 0;
  let cut = false;
  let more = false;

  try {
    for await (const text of rl) {
      count += 1;
      if (count <= start) continue;

      if (raw.length >= opts.limit) {
        more = true;
        continue;
      }

      const line =
        text.length > MAX_LINE_LENGTH
          ? text.substring(0, MAX_LINE_LENGTH) + `... (line truncated to ${MAX_LINE_LENGTH} chars)`
          : text;
      const size = Buffer.byteLength(line, "utf-8") + (raw.length > 0 ? 1 : 0);
      if (bytes + size > MAX_BYTES) {
        cut = true;
        more = true;
        break;
      }

      raw.push(line);
      bytes += size;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return { raw, count, cut, more, offset: opts.offset };
}

export function createReadTool(workspacePath?: string): Tool {
  return createTool({
    name: "read",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "The absolute path to the file or directory to read",
        },
        offset: {
          type: "number",
          description: "The line number to start reading from (1-indexed)",
        },
        limit: {
          type: "number",
          description: `The maximum number of lines to read (defaults to ${DEFAULT_READ_LIMIT})`,
        },
      },
      required: ["filePath"],
    },
    execute: async (args) => {
      const filePath = args.filePath as string;
      const offset = (args.offset as number | undefined) ?? 1;
      const limit = (args.limit as number | undefined) ?? DEFAULT_READ_LIMIT;

      if (!filePath) return fail("filePath is required");
      if (offset < 1) return fail("offset must be >= 1");

      let resolved: string;
      try {
        resolved = resolveAndGuard(filePath, workspacePath);
      } catch (msg) {
        return fail(msg as string);
      }

      let stat;
      try {
        stat = statSync(resolved);
      } catch {
        return fail(`File not found: ${resolved}`);
      }

      if (stat.isDirectory()) {
        try {
          const entries = readdirSync(resolved, { withFileTypes: true });
          const items = entries
            .map((e) => (e.isDirectory() ? e.name + "/" : e.name))
            .sort((a, b) => a.localeCompare(b));

          const start = offset - 1;
          const sliced = items.slice(start, start + limit);
          const truncated = start + sliced.length < items.length;

          const output = [
            `<path>${resolved}</path>`,
            `<type>directory</type>`,
            `<entries>`,
            sliced.join("\n"),
            truncated
              ? `\n(Showing ${sliced.length} of ${items.length} entries. Use 'offset' parameter to read beyond entry ${offset + sliced.length})`
              : `\n(${items.length} entries)`,
            `</entries>`,
          ].join("\n");

          return ok(output);
        } catch (err: unknown) {
          return fail(`Failed to read directory: ${(err as Error).message}`);
        }
      }

      // Binary file detection by extension
      const binaryExts = new Set([
        ".zip", ".tar", ".gz", ".exe", ".dll", ".so", ".class", ".jar",
        ".7z", ".bin", ".dat", ".obj", ".o", ".a", ".lib", ".wasm", ".pyc",
      ]);
      if (binaryExts.has(path.extname(resolved).toLowerCase())) {
        return fail(`Cannot read binary file: ${resolved}`);
      }

      try {
        const file = await readLines(resolved, { limit, offset });

        if (file.count < file.offset && !(file.count === 0 && file.offset === 1)) {
          return fail(`Offset ${file.offset} is out of range for this file (${file.count} lines)`);
        }

        let output = `<path>${resolved}</path>\n<type>file</type>\n<content>\n`;
        output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n");

        const last = file.offset + file.raw.length - 1;
        const next = last + 1;
        if (file.cut) {
          output += `\n\n(Output capped at ${MAX_BYTES / 1024} KB. Showing lines ${file.offset}-${last}. Use offset=${next} to continue.)`;
        } else if (file.more) {
          output += `\n\n(Showing lines ${file.offset}-${last} of ${file.count}. Use offset=${next} to continue.)`;
        } else {
          output += `\n\n(End of file - total ${file.count} lines)`;
        }
        output += "\n</content>";

        return ok(output);
      } catch (err: unknown) {
        return fail(`Failed to read file: ${(err as Error).message}`);
      }
    },
  });
}
