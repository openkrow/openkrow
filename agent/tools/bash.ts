/**
 * BashTool — Execute bash commands in a shell session.
 *
 * Spawns a child process with configurable timeout, working directory,
 * and captures stdout/stderr.
 */

import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";
import { createTool, loadDescription, ok, fail, resolveAndGuard } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const RAW_DESCRIPTION = loadDescription(import.meta.url, "bash.txt");
const DEFAULT_TIMEOUT = 2 * 60 * 1000;
const MAX_OUTPUT_BYTES = 100 * 1024;

function getShell(): { shell: string; name: string } {
  if (os.platform() === "win32") {
    const ps = process.env.ComSpec || "cmd.exe";
    return { shell: ps, name: path.basename(ps, path.extname(ps)) };
  }
  const shell = process.env.SHELL || "/bin/bash";
  return { shell, name: path.basename(shell) };
}

export function createBashTool(workingDirectory?: string, workspacePath?: string): Tool {
  const { shell, name } = getShell();
  const cwd = workingDirectory ?? process.cwd();

  const description = RAW_DESCRIPTION
    .replaceAll("${os}", os.platform())
    .replaceAll("${shell}", name)
    .replaceAll(
      "${chaining}",
      name === "powershell"
        ? "Avoid '&&' in PowerShell. Use `cmd1; if ($?) { cmd2 }` for sequential dependent commands."
        : "Use '&&' to chain dependent commands (e.g., `mkdir foo && cd foo`).",
    );

  return createTool({
    name: "bash",
    description,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute",
        },
        timeout: {
          type: "number",
          description: "Optional timeout in milliseconds",
        },
        workdir: {
          type: "string",
          description:
            "The working directory to run the command in. Defaults to the current directory. Use this instead of 'cd' commands.",
        },
        description: {
          type: "string",
          description:
            'Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status',
        },
      },
      required: ["command", "description"],
    },
    execute: async (args) => {
      const command = args.command as string;
      const timeout = (args.timeout as number | undefined) ?? DEFAULT_TIMEOUT;
      const workdir = (args.workdir as string | undefined) ?? cwd;

      if (!command) return fail("command is required");
      if (timeout < 0) return fail("timeout must be a positive number");

      let resolvedCwd: string;
      try {
        const target = path.isAbsolute(workdir) ? workdir : path.resolve(cwd, workdir);
        resolvedCwd = resolveAndGuard(target, workspacePath, cwd);
      } catch (msg) {
        return fail(msg as string);
      }

      return new Promise((resolve) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let truncated = false;

        const child = spawn(command, [], {
          shell,
          cwd: resolvedCwd,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        const collect = (data: Buffer) => {
          if (totalBytes >= MAX_OUTPUT_BYTES) {
            truncated = true;
            return;
          }
          chunks.push(data);
          totalBytes += data.length;
        };

        child.stdout?.on("data", collect);
        child.stderr?.on("data", collect);

        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          setTimeout(() => child.kill("SIGKILL"), 3000);
        }, timeout);

        child.on("close", (code) => {
          clearTimeout(timer);
          let output = Buffer.concat(chunks).toString("utf-8");

          if (!output) output = "(no output)";
          if (truncated) {
            output = `...output truncated (exceeded ${MAX_OUTPUT_BYTES / 1024} KB)...\n\n` + output;
          }

          if (code !== 0 && code !== null) {
            resolve({
              success: false,
              output,
              error: `Command exited with code ${code}`,
            });
          } else {
            resolve(ok(output));
          }
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          resolve(fail(`Failed to execute command: ${err.message}`));
        });
      });
    },
  });
}
