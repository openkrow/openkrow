/**
 * TodoTool — In-memory task list management.
 *
 * The LLM sends the complete updated todo list on each call.
 * Data is kept in memory for the session lifetime.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "todo.txt");

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: "high" | "medium" | "low";
}

export function createTodoTool(): { tool: Tool; getTodos: () => TodoItem[] } {
  let todos: TodoItem[] = [];

  const tool = createTool({
    name: "todowrite",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "The updated todo list",
          items: {
            type: "object",
            properties: {
              content: { type: "string", description: "Brief description of the task" },
              status: {
                type: "string",
                description: "Current status: pending, in_progress, completed, cancelled",
              },
              priority: { type: "string", description: "Priority level: high, medium, low" },
            },
            required: ["content", "status", "priority"],
          },
        },
      },
      required: ["todos"],
    },
    execute: async (args) => {
      const items = args.todos as TodoItem[];
      if (!Array.isArray(items)) return fail("todos must be an array");

      todos = items;
      const pending = items.filter((t) => t.status !== "completed" && t.status !== "cancelled").length;

      return ok(
        `${pending} todo${pending !== 1 ? "s" : ""} remaining.\n\n${JSON.stringify(items, null, 2)}`,
      );
    },
  });

  return {
    tool,
    getTodos: () => [...todos],
  };
}
