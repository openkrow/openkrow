import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "@openkrow/agent";

const execFileAsync = promisify(execFile);

export const bashTool: Tool = {
  definition: {
    name: "bash",
    description:
      "Execute a bash command and return its output. Use for running tests, builds, git commands, etc.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)",
        },
      },
      required: ["command"],
    },
  },

  async execute(args: Record<string, unknown>) {
    try {
      const timeout = (args.timeout as number) ?? 30000;
      const { stdout, stderr } = await execFileAsync(
        "/bin/bash",
        ["-c", args.command as string],
        {
          timeout,
          maxBuffer: 1024 * 1024 * 10, // 10MB
          cwd: process.cwd(),
        }
      );

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
      return { success: true, output };
    } catch (error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        message: string;
      };
      return {
        success: false,
        output: execError.stdout ?? "",
        error: execError.stderr ?? execError.message,
      };
    }
  },
};
