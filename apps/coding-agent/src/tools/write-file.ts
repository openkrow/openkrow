import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool } from "@openkrow/agent";

export const writeFileTool: Tool = {
  definition: {
    name: "write_file",
    description:
      "Write content to a file. Creates the file if it doesn't exist, or overwrites it.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to write to",
        },
        content: {
          type: "string",
          description: "The content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },

  async execute(args: Record<string, unknown>) {
    try {
      const filePath = path.resolve(args.path as string);
      const dir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");

      return { success: true, output: `Wrote to ${filePath}` };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Failed to write file",
      };
    }
  },
};
