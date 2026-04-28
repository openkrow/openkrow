# Workspace

A workspace is a directory where OpenKrow stores context, jobs, templates, and scripts. It serves as the organizational unit — there are no users or sessions, just workspaces.

## Structure

```
<workspace>/
  .krow/
    data.db         — Workspace database (conversations, messages)
  context.md        — Persistent context loaded into every LLM call
  templates/        — Reusable templates the agent reads instead of generating from scratch
  jobs/             — Chat sessions stored as JSON files
  scripts/          — Scripts written by the agent
```

## context.md

This file is appended to every system prompt as a `# Workspace Context` section. Use it to give the agent persistent knowledge about your project:

```markdown
# Workspace Context

## Project
- **Name**: Q4 Sales Report
- **Description**: Quarterly sales analysis and reporting

## Conventions
- Use formal tone in all documents
- Currency format: USD with 2 decimal places

## Notes
- Data source: sales_data.xlsx in templates/
- Report template: templates/quarterly_report.docx
```

Changes to `context.md` take effect on the next conversation turn.

## Jobs

Jobs represent chat sessions and are stored as individual JSON files in `jobs/`:

```json
{
  "id": "job-abc123",
  "description": "Generate Q4 sales report",
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:30:00Z",
  "scheduledTasks": [
    {
      "description": "Regenerate report with updated data",
      "schedule": "2025-02-01T09:00:00Z",
      "completed": false
    }
  ]
}
```

## Templates

Place reusable files in `templates/` that the agent can reference instead of generating from scratch. Examples: document templates, letterheads, report formats.

## Scripts

The `scripts/` directory holds scripts the agent writes during task execution. These can be reused across conversations.

## WorkspaceManager API

The `WorkspaceManager` class (`@openkrow/workspace` package) provides:

- `init(path)` — Create workspace structure and default context.md
- `load(path)` — Load an existing workspace
- `refreshContext()` — Re-read context.md from disk
- `createJob(description)` / `getJob(id)` / `listJobs()` / `deleteJob(id)` — Job CRUD
- `listTemplates()` / `listScripts()` — List workspace files

## Database

Each workspace has its own SQLite database at `.krow/data.db` containing conversations and messages. This is separate from the global database (`~/.openkrow/database/openkrow.db`) which stores settings only.
