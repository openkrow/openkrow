import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool } from "@openkrow/agent";

export const readFileTool: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file at the given path. Returns the file content as a string.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to read (relative to current working directory)",
        },
        offset: {
          type: "number",
          description: "Line number to start reading from (1-indexed, optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of lines to read (optional, default 2000)",
        },
      },
      required: ["path"],
    },
  },

  async execute(args: Record<string, unknown>) {
    try {
      const filePath = path.resolve(args.path as string);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      const offset = ((args.offset as number) ?? 1) - 1;
      const limit = (args.limit as number) ?? 2000;
      const slice = lines.slice(offset, offset + limit);

      const numbered = slice
        .map((line, i) => `${offset + i + 1}: ${line}`)
        .join("\n");

      return { success: true, output: numbered };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Failed to read file",
      };
    }
  },
};
