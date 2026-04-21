import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "@openkrow/agent";

const execFileAsync = promisify(execFile);

export const grepTool: Tool = {
  definition: {
    name: "grep",
    description:
      "Search for a pattern in files using grep. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "The regex pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in (default: current directory)",
        },
        include: {
          type: "string",
          description: "File glob pattern to include (e.g., '*.ts')",
        },
      },
      required: ["pattern"],
    },
  },

  async execute(args: Record<string, unknown>) {
    try {
      const searchPath = (args.path as string) ?? ".";
      const grepArgs = ["-rn", "--color=never"];

      if (args.include) {
        grepArgs.push(`--include=${args.include}`);
      }

      grepArgs.push(args.pattern as string, searchPath);

      const { stdout } = await execFileAsync("grep", grepArgs, {
        maxBuffer: 1024 * 1024 * 5,
        cwd: process.cwd(),
      });

      return { success: true, output: stdout.trim() };
    } catch (error) {
      const execError = error as { stdout?: string; code?: number };
      // grep returns exit code 1 when no matches found
      if (execError.code === 1) {
        return { success: true, output: "No matches found." };
      }
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : "Grep failed",
      };
    }
  },
};
