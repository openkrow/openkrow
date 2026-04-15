import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { glob } from "glob";
import { Agent, type Tool, type ToolResult } from "@openkrow/agent-core";

const execFileAsync = promisify(execFile);

/**
 * Register all built-in tools on an agent instance.
 */
export function registerBuiltinTools(agent: Agent): void {
  agent.tools.register(readFile);
  agent.tools.register(writeFile);
  agent.tools.register(editFile);
  agent.tools.register(bash);
  agent.tools.register(grepSearch);
  agent.tools.register(listFiles);
}

// ---------------------------------------------------------------------------
// read_file
// ---------------------------------------------------------------------------
const readFile: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file. Returns numbered lines for easy reference.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the working directory",
        },
        offset: {
          type: "number",
          description: "Start line (1-indexed). Default: 1",
        },
        limit: {
          type: "number",
          description: "Max lines to return. Default: 2000",
        },
      },
      required: ["path"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const filePath = path.resolve(args.path as string);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      const offset = ((args.offset as number) ?? 1) - 1;
      const limit = (args.limit as number) ?? 2000;
      const slice = lines.slice(offset, offset + limit);
      const numbered = slice.map((l, i) => `${offset + i + 1}: ${l}`).join("\n");
      return { success: true, output: numbered };
    } catch (e) {
      return { success: false, output: "", error: (e as Error).message };
    }
  },
};

// ---------------------------------------------------------------------------
// write_file
// ---------------------------------------------------------------------------
const writeFile: Tool = {
  definition: {
    name: "write_file",
    description:
      "Create or overwrite a file with the given content. Parent directories are created automatically.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        content: { type: "string", description: "Full file content" },
      },
      required: ["path", "content"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const filePath = path.resolve(args.path as string);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, args.content as string, "utf-8");
      return { success: true, output: `Wrote ${filePath}` };
    } catch (e) {
      return { success: false, output: "", error: (e as Error).message };
    }
  },
};

// ---------------------------------------------------------------------------
// edit_file
// ---------------------------------------------------------------------------
const editFile: Tool = {
  definition: {
    name: "edit_file",
    description:
      "Replace an exact string in a file. Use for surgical edits instead of rewriting the whole file.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        old_string: { type: "string", description: "Exact text to find" },
        new_string: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const filePath = path.resolve(args.path as string);
      const content = await fs.readFile(filePath, "utf-8");
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;

      if (!content.includes(oldStr)) {
        return { success: false, output: "", error: "old_string not found in file" };
      }

      const occurrences = content.split(oldStr).length - 1;
      if (occurrences > 1) {
        return {
          success: false,
          output: "",
          error: `Found ${occurrences} matches for old_string. Provide more context to make it unique.`,
        };
      }

      const updated = content.replace(oldStr, newStr);
      await fs.writeFile(filePath, updated, "utf-8");
      return { success: true, output: `Edited ${filePath}` };
    } catch (e) {
      return { success: false, output: "", error: (e as Error).message };
    }
  },
};

// ---------------------------------------------------------------------------
// bash
// ---------------------------------------------------------------------------
const bash: Tool = {
  definition: {
    name: "bash",
    description:
      "Execute a shell command. Use for builds, tests, git, installs, etc.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
        timeout: {
          type: "number",
          description: "Timeout in ms. Default: 30000",
        },
      },
      required: ["command"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const timeout = (args.timeout as number) ?? 30_000;
      const { stdout, stderr } = await execFileAsync(
        "/bin/bash",
        ["-c", args.command as string],
        { timeout, maxBuffer: 10 * 1024 * 1024, cwd: process.cwd() }
      );
      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
      return { success: true, output };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message: string };
      return {
        success: false,
        output: err.stdout ?? "",
        error: err.stderr ?? err.message,
      };
    }
  },
};

// ---------------------------------------------------------------------------
// grep
// ---------------------------------------------------------------------------
const grepSearch: Tool = {
  definition: {
    name: "grep",
    description:
      "Search file contents for a regex pattern. Returns matching lines with paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern" },
        path: {
          type: "string",
          description: "Directory or file to search. Default: .",
        },
        include: {
          type: "string",
          description: "File glob to include (e.g. '*.ts')",
        },
      },
      required: ["pattern"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const searchPath = (args.path as string) ?? ".";
      const grepArgs = ["-rn", "--color=never"];
      if (args.include) grepArgs.push(`--include=${args.include}`);
      grepArgs.push(args.pattern as string, searchPath);

      const { stdout } = await execFileAsync("grep", grepArgs, {
        maxBuffer: 5 * 1024 * 1024,
        cwd: process.cwd(),
      });
      return { success: true, output: stdout.trim() };
    } catch (e) {
      const err = e as { code?: number };
      if (err.code === 1) return { success: true, output: "No matches found." };
      return { success: false, output: "", error: (e as Error).message };
    }
  },
};

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------
const listFiles: Tool = {
  definition: {
    name: "list_files",
    description:
      "List files matching a glob pattern. Useful for exploring project structure.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob (e.g. 'src/**/*.ts')" },
        path: {
          type: "string",
          description: "Base directory. Default: cwd",
        },
      },
      required: ["pattern"],
    },
  },
  async execute(args): Promise<ToolResult> {
    try {
      const files = await glob(args.pattern as string, {
        cwd: (args.path as string) ?? process.cwd(),
        ignore: ["node_modules/**", ".git/**", "dist/**"],
      });
      if (files.length === 0) {
        return { success: true, output: "No files matched." };
      }
      return { success: true, output: files.sort().join("\n") };
    } catch (e) {
      return { success: false, output: "", error: (e as Error).message };
    }
  },
};
