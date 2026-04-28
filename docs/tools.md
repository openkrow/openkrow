# Tools

Tools are the actions the OpenKrow agent can perform. Each tool has a TypeScript implementation (`.ts`) and a plain-text description file (`.txt`) that the LLM reads to understand how to use it.

## Built-in Tools

### read

Read files from the workspace. Supports text files with line numbers, offset/limit pagination, and binary file detection.

### write

Create or overwrite files in the workspace. The agent uses this to generate documents, scripts, and data files.

### edit

Make targeted edits to existing files using exact string matching. Supports single replacements and `replaceAll` for bulk renames.

### bash

Execute shell commands within the workspace. Commands are sandboxed to the workspace directory. Supports configurable timeouts.

### todo

In-memory task list for planning and tracking multi-step work. The agent uses this to break down complex requests and show progress.

### webfetch

Fetch content from URLs and convert to markdown, text, or HTML. Used for reading web pages, documentation, and online resources.

### websearch

Search the web using DuckDuckGo HTML scraping (no API key required). Returns titles, URLs, and snippets for the top results.

### skill

Load specialized skills that provide domain-specific instructions. When the agent needs to work with PDFs, Word docs, spreadsheets, or presentations, it loads the appropriate skill for detailed guidance.

### question

Ask the user clarifying questions during task execution. Supports multiple-choice options and free-text input. Used when the agent needs user decisions before proceeding.

## Tool Architecture

All tools follow the same pattern:

```
packages/agent/tools/
  create-tool.ts   — Factory helper: createTool(), ok(), fail(), resolveAndGuard()
  index.ts         — ToolManager: auto-registers all built-in tools
  read.ts + read.txt
  write.ts + write.txt
  ...
```

- `createTool(def, handler)` wraps a handler function with the tool definition
- `ok(result)` / `fail(error)` produce standardized `ToolResult` objects
- `resolveAndGuard(path, workspacePath)` ensures file paths stay inside the workspace (sandbox)
- `ToolManager` discovers and registers all tools automatically — the agent doesn't manage individual tools

## Workspace Sandboxing

All file-accessing tools (read, write, edit, bash) validate that resolved paths stay within the workspace directory. Attempts to access files outside the workspace are rejected with an error. This prevents the agent from accidentally (or intentionally) modifying system files.
