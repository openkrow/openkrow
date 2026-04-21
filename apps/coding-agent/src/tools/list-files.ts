import { glob } from "glob";
import type { Tool } from "@openkrow/agent";

export const listFilesTool: Tool = {
  definition: {
    name: "list_files",
    description:
      "List files matching a glob pattern. Useful for exploring project structure.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern (e.g., 'src/**/*.ts', '*.json')",
        },
        path: {
          type: "string",
          description: "Base directory to search from (default: current directory)",
        },
      },
      required: ["pattern"],
    },
  },

  async execute(args: Record<string, unknown>) {
    try {
      const files = await glob(args.pattern as string, {
        cwd: (args.path as string) ?? process.cwd(),
        nodir: false,
        ignore: ["node_modules/**", ".git/**", "dist/**"],
      });

      if (files.length === 0) {
        return { success: true, output: "No files found matching pattern." };
      }

      return { success: true, output: files.sort().join("\n") };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Failed to list files",
      };
    }
  },
};
