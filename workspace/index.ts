/**
 * @openkrow/workspace — Workspace management package.
 *
 * A workspace is a user-provided directory with a standard structure:
 *
 *   <workspace>/
 *     context.md    — Persistent context loaded into every LLM call
 *     templates/    — Reusable templates the agent reads instead of generating from scratch
 *     jobs/         — Chat sessions as JSON files (description, messages, scheduled tasks)
 *     scripts/      — Scripts written by the AI agent
 *
 * The workspace path is provided by the caller (e.g. from app config or CLI flag).
 * WorkspaceManager handles initialization, reading context, and managing jobs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceContext {
  /** Resolved absolute path to the workspace root */
  path: string;
  /** Derived project/workspace name (last segment of path) */
  projectName: string;
  /** Content of context.md, or empty string if not found */
  contextMd: string;
}

export interface Job {
  /** Unique job ID (used as filename: <id>.json) */
  id: string;
  /** Human-readable description of the chat session */
  description: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Scheduled tasks associated with this job */
  scheduledTasks?: ScheduledTask[];
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface ScheduledTask {
  /** What to do */
  description: string;
  /** ISO timestamp or cron expression */
  schedule: string;
  /** Whether the task has been completed */
  completed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTEXT_FILE = "context.md";
const DIRS = ["templates", "jobs", "scripts"] as const;

const DEFAULT_CONTEXT_MD = `# Workspace Context

This file is loaded into every LLM conversation. Use it to give the agent
persistent context about your project, preferences, and conventions.

## Project

- **Name**: (your project name)
- **Description**: (what this project does)
- **Tech stack**: (languages, frameworks, tools)

## Conventions

- (coding style, naming conventions, etc.)

## Notes

- (anything else the agent should always know)
`;

// ---------------------------------------------------------------------------
// WorkspaceManager
// ---------------------------------------------------------------------------

export class WorkspaceManager {
  private _path: string | null = null;
  private _context: WorkspaceContext | null = null;

  /**
   * Initialize a workspace at the given path.
   * Creates the directory structure and default context.md if they don't exist.
   * Returns the loaded WorkspaceContext.
   */
  init(workspacePath: string): WorkspaceContext {
    const abs = resolve(workspacePath);
    this._path = abs;

    // Ensure root dir
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true });
    }

    // Ensure subdirectories
    for (const dir of DIRS) {
      const dirPath = join(abs, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }

    // Ensure context.md with starter content
    const contextPath = join(abs, CONTEXT_FILE);
    if (!existsSync(contextPath)) {
      writeFileSync(contextPath, DEFAULT_CONTEXT_MD, "utf-8");
    }

    // Load and cache context
    this._context = this.buildContext(abs);
    return this._context;
  }

  /**
   * Load an existing workspace without creating missing structure.
   * Throws if the path doesn't exist.
   */
  load(workspacePath: string): WorkspaceContext {
    const abs = resolve(workspacePath);
    if (!existsSync(abs)) {
      throw new Error(`Workspace path does not exist: ${abs}`);
    }
    this._path = abs;
    this._context = this.buildContext(abs);
    return this._context;
  }

  /**
   * Re-read context.md from disk. Call this before each LLM invocation
   * if you want to pick up live edits.
   */
  refreshContext(): WorkspaceContext | null {
    if (!this._path) return null;
    this._context = this.buildContext(this._path);
    return this._context;
  }

  getContext(): WorkspaceContext | null {
    return this._context;
  }

  /** Get the content of context.md (empty string if not loaded). */
  getContextMd(): string {
    return this._context?.contextMd ?? "";
  }

  isLoaded(): boolean {
    return this._context !== null;
  }

  /** Resolved workspace root path, or null if not loaded. */
  getPath(): string | null {
    return this._path;
  }

  // ---- Jobs ----

  /**
   * Save a job (creates or overwrites).
   */
  saveJob(job: Job): void {
    this.ensureLoaded();
    const filePath = join(this._path!, "jobs", `${job.id}.json`);
    writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
  }

  /**
   * Load a job by ID. Returns null if not found.
   */
  getJob(id: string): Job | null {
    this.ensureLoaded();
    const filePath = join(this._path!, "jobs", `${id}.json`);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as Job;
    } catch {
      return null;
    }
  }

  /**
   * List all job IDs (sorted by filename).
   */
  listJobs(): string[] {
    this.ensureLoaded();
    const jobsDir = join(this._path!, "jobs");
    if (!existsSync(jobsDir)) return [];
    return readdirSync(jobsDir)
      .filter((f: string) => f.endsWith(".json"))
      .map((f: string) => f.replace(/\.json$/, ""))
      .sort();
  }

  /**
   * Delete a job by ID. Returns true if deleted, false if not found.
   */
  deleteJob(id: string): boolean {
    this.ensureLoaded();
    const filePath = join(this._path!, "jobs", `${id}.json`);
    if (!existsSync(filePath)) return false;
    unlinkSync(filePath);
    return true;
  }

  // ---- Templates ----

  /**
   * Read a template file by name. Returns null if not found.
   */
  getTemplate(name: string): string | null {
    this.ensureLoaded();
    const filePath = join(this._path!, "templates", name);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * List all template filenames.
   */
  listTemplates(): string[] {
    this.ensureLoaded();
    const dir = join(this._path!, "templates");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).sort();
  }

  /**
   * Save a template file.
   */
  saveTemplate(name: string, content: string): void {
    this.ensureLoaded();
    const filePath = join(this._path!, "templates", name);
    writeFileSync(filePath, content, "utf-8");
  }

  // ---- Scripts ----

  /**
   * Save a script file.
   */
  saveScript(name: string, content: string): void {
    this.ensureLoaded();
    const filePath = join(this._path!, "scripts", name);
    writeFileSync(filePath, content, "utf-8");
  }

  /**
   * Read a script file. Returns null if not found.
   */
  getScript(name: string): string | null {
    this.ensureLoaded();
    const filePath = join(this._path!, "scripts", name);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * List all script filenames.
   */
  listScripts(): string[] {
    this.ensureLoaded();
    const dir = join(this._path!, "scripts");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).sort();
  }

  // ---- Internals ----

  private buildContext(abs: string): WorkspaceContext {
    const contextPath = join(abs, CONTEXT_FILE);
    let contextMd = "";
    if (existsSync(contextPath)) {
      try {
        contextMd = readFileSync(contextPath, "utf-8");
      } catch {
        contextMd = "";
      }
    }

    return {
      path: abs,
      projectName: abs.split("/").pop() || "workspace",
      contextMd,
    };
  }

  private ensureLoaded(): void {
    if (!this._path) {
      throw new Error("Workspace not loaded. Call init() or load() first.");
    }
  }
}
