/**
 * ToolManager — Manages available tools with auto-registration of built-ins.
 *
 * Also re-exports all built-in tool factories and helpers for convenience.
 */

import type { Tool, ToolDefinition, ToolResult } from "../types/index.js";
import type { SkillManager } from "@openkrow/skill";
import type { QuestionHandler } from "./question.js";
import type { TodoItem } from "./todo.js";

import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";
import { createEditTool } from "./edit.js";
import { createBashTool } from "./bash.js";
import { createTodoTool } from "./todo.js";
import { createWebFetchTool } from "./webfetch.js";
import { createWebSearchTool } from "./websearch.js";
import { createSkillTool } from "./skill.js";
import { createQuestionTool } from "./question.js";
import { createShowWidgetTool } from "./show-widget.js";

// ---------------------------------------------------------------------------
// ToolManager options — dependencies needed by built-in tools
// ---------------------------------------------------------------------------

export interface ToolManagerOptions {
  /** Working directory for bash tool (defaults to workspacePath or process.cwd()) */
  cwd?: string;
  /** Workspace root path — all file tools are sandboxed to this directory */
  workspacePath?: string;
  /** SkillManager instance for the skill tool (omit to skip skill tool) */
  skillManager?: SkillManager;
  /** Callback for question tool (omit to skip question tool) */
  questionHandler?: QuestionHandler;
}

export class ToolManager {
  private tools = new Map<string, Tool>();
  private _getTodos?: () => TodoItem[];

  constructor(options: ToolManagerOptions = {}) {
    this.registerBuiltins(options);
  }

  /**
   * Auto-register all built-in tools based on provided dependencies.
   */
  private registerBuiltins(opts: ToolManagerOptions): void {
    const wp = opts.workspacePath;

    // File tools — sandboxed to workspace when workspacePath is set
    this.register(createReadTool(wp));
    this.register(createWriteTool(wp));
    this.register(createEditTool(wp));
    this.register(createBashTool(opts.cwd ?? wp, wp));

    // Network tools — no workspace restriction
    this.register(createWebFetchTool());
    this.register(createWebSearchTool());

    // Todo tool — keep reference to getTodos for UI access
    const { tool: todoTool, getTodos } = createTodoTool();
    this.register(todoTool);
    this._getTodos = getTodos;

    // Widget tool — no dependencies
    this.register(createShowWidgetTool());

    // Conditional tools — only register if dependencies provided
    if (opts.skillManager) {
      this.register(createSkillTool(opts.skillManager));
    }
    if (opts.questionHandler) {
      this.register(createQuestionTool(opts.questionHandler));
    }
  }

  /** Get current todo items (for UI layer). */
  getTodos(): TodoItem[] {
    return this._getTodos ? this._getTodos() : [];
  }

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, output: "", error: `Tool "${name}" not found` };
    }
    return tool.execute(args);
  }

  list(): string[] {
    return Array.from(this.tools.keys());
  }

  clear(): void {
    this.tools.clear();
  }
}

// Backward compat alias
export { ToolManager as ToolRegistry };

// ---------------------------------------------------------------------------
// Re-export tool factories and helpers
// ---------------------------------------------------------------------------

export { createTool, loadDescription, ok, fail, resolveAndGuard } from "./create-tool.js";
export type { CreateToolOptions } from "./create-tool.js";

export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";
export { createEditTool } from "./edit.js";
export { createBashTool } from "./bash.js";
export { createTodoTool } from "./todo.js";
export type { TodoItem } from "./todo.js";
export { createWebFetchTool } from "./webfetch.js";
export { createWebSearchTool } from "./websearch.js";
export { createSkillTool } from "./skill.js";
export { createQuestionTool } from "./question.js";
export type { QuestionOption, QuestionPrompt, QuestionHandler } from "./question.js";
export { createShowWidgetTool } from "./show-widget.js";
