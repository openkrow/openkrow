# Contributing to OpenKrow

Thank you for your interest in contributing to OpenKrow. This guide covers everything you need to get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Requests](#pull-requests)
- [Adding a Tool](#adding-a-tool)
- [Adding a Skill](#adding-a-skill)
- [Adding an LLM Provider](#adding-an-llm-provider)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.0.0
- Node.js >= 20
- Git

### Setup

```bash
# Fork and clone
git clone https://github.com/<your-username>/openkrow.git
cd openkrow
git remote add upstream https://github.com/openkrow/openkrow.git

# Install and build
bun install
bun run build

# Verify
bun run test
bun run typecheck
```

## Project Structure

```
openkrow/
  apps/openkrow/        # HTTP server (the main application)
  packages/
    llm/                # Multi-provider LLM client
    agent/              # Agent runtime (query loop, tools, context)
    database/           # SQLite (global settings + per-workspace data)
    config/             # Configuration management
    workspace/          # Workspace file management
    skill/              # Skill system
    tui/                # Terminal UI components
    web-ui/             # Web UI components
  docs/                 # Documentation
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how everything connects.

## Making Changes

### Branch Naming

```
feat/     New features          feat/calendar-integration
fix/      Bug fixes             fix/streaming-abort-crash
refactor/ Code refactoring      refactor/database-split
docs/     Documentation         docs/api-reference
test/     Tests                 test/agent-context-compaction
chore/    Build, CI, deps       chore/upgrade-bun
```

### Workflow

```bash
git checkout main
git pull upstream main
git checkout -b feat/my-feature

# Make changes, then:
bun run build
bun run test
bun run typecheck

git add .
git commit -m "feat(agent): add retry logic for failed tool calls"
git push origin feat/my-feature
```

Then open a pull request on GitHub.

## Coding Standards

### TypeScript

- **Strict mode** is on. Avoid `any`.
- Use `.js` extensions in all local imports:
  ```typescript
  import { Agent } from "./agent/index.js";     // correct
  import { Agent } from "./agent/index";         // wrong
  ```
- Use `import type` for type-only imports.
- No inline `import("...")` type annotations.
- No Effect library. Plain async/await.

### Architecture Rules

- The app layer never reads/writes the database directly. All DB access goes through package APIs.
- No global singletons. Connections and managers are passed as instances.
- Tools use the `createTool()` factory with `ok()`/`fail()` helpers.
- Tool descriptions live in `.txt` files, separate from implementation.
- File-accessing tools must use `resolveAndGuard()` for workspace sandboxing.

### Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Scopes: `agent`, `llm`, `database`, `config`, `workspace`, `skill`, `app`, `tui`, `web-ui`

## Testing

```bash
# All tests
bun run test

# Specific package
cd packages/agent && bun test __tests__/context.test.ts
cd packages/config && bun test
cd packages/skill && bun test
cd packages/llm && bun test
```

When adding features:
- Write unit tests for core logic
- Test edge cases (empty input, invalid input, missing dependencies)
- For tools: test both success and failure paths
- For context assembly: test with various message sizes to verify compaction phases

## Pull Requests

1. Ensure CI passes (build, test, typecheck)
2. Write a clear description: what, why, how tested, breaking changes
3. One feature or fix per PR
4. Update docs if you change public APIs
5. Add tests for new functionality

## Adding a Tool

1. Create `packages/agent/tools/<name>.ts`:
   ```typescript
   import { createTool, loadDescription, ok, fail } from "./create-tool.js";

   export function createMyTool() {
     return createTool({
       name: "my_tool",
       description: loadDescription("my_tool"),
       parameters: {
         type: "object",
         properties: {
           input: { type: "string", description: "The input" },
         },
         required: ["input"],
       },
       execute: async (args) => {
         try {
           // Do work
           return ok("Result");
         } catch (err) {
           return fail(err instanceof Error ? err.message : "Unknown error");
         }
       },
     });
   }
   ```

2. Create `packages/agent/tools/<name>.txt` with the tool description (this is what the LLM sees).

3. Register in `packages/agent/tools/index.ts` (ToolManager).

4. Write tests. Run `bun run build && bun run test`.

## Adding a Skill

1. Create a `SKILL.md` file with YAML frontmatter:
   ```markdown
   ---
   name: my-skill
   description: What this skill does
   tools: [bash, write, read]
   ---

   # My Skill

   Instructions the agent follows when this skill is loaded...
   ```

2. Host it (URL or local file path).

3. To make it a built-in, add it to `packages/skill/src/builtins.ts`.

## Adding an LLM Provider

1. Add to `KnownProvider` in `packages/llm/src/types.ts`
2. Implement stream function in `packages/llm/src/providers/<name>.ts`
3. Register in `packages/llm/src/providers/register-builtins.ts`
4. Add models to `packages/llm/src/models.ts`
5. Add env var mapping to `packages/llm/src/env-api-keys.ts`
6. Write tests

## Questions?

Open a [discussion](https://github.com/openkrow/openkrow/discussions) or file an issue.
