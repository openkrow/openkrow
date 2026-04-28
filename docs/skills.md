# Skills

Skills extend the agent's capabilities with domain-specific instructions for handling particular file types and workflows.

## Built-in Skills

OpenKrow ships with four built-in skills for office document processing:

| Skill | Description |
| ----- | ----------- |
| **pdf** | Read, extract, merge, split, rotate, watermark, create, fill forms, encrypt/decrypt, OCR PDF files |
| **docx** | Create, read, edit Word documents — reports, memos, letters, templates |
| **xlsx** | Open, read, edit, create spreadsheets — data cleaning, formulas, formatting, charting |
| **pptx** | Create, read, edit PowerPoint presentations — slide decks, templates, layouts |

Skills are sourced from the [Anthropic Skills repository](https://github.com/anthropics/skills) and loaded on demand.

## How Skills Work

1. **Installation**: Skills are installed via `SkillManager.install(name)`. Built-in skills are available by name; custom skills can be installed from URLs.

2. **Loading**: When the agent encounters a task matching a skill's description, it uses the `skill` tool to load the skill's SKILL.md content.

3. **Prompt Injection**: Enabled skills inject their descriptions into the system prompt so the LLM knows they're available. The full skill content is loaded only when the `skill` tool is invoked.

4. **Enable/Disable**: Skills can be enabled or disabled without uninstalling them. Disabled skills don't appear in the system prompt.

## Skill Format

Each skill is defined by a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: pdf
description: Use this skill for PDF file operations
tools:
  - bash
dependencies:
  - poppler-utils
  - qpdf
---

# PDF Skill

Instructions for the agent on how to handle PDF files...
```

## SkillManager API

The `SkillManager` class (`@openkrow/skill` package) provides:

- `install(name)` — Install a built-in or custom skill
- `uninstall(name)` — Remove an installed skill
- `enable(name)` / `disable(name)` — Toggle skill availability
- `getSkill(name)` — Get full skill content
- `listInstalled()` — List all installed skills
- `getPromptSnippet()` — Generate system prompt text for all enabled skills

## Adding Custom Skills

Custom skills can be added by providing a URL to a SKILL.md file:

```typescript
skillManager.install("my-skill", {
  type: "url",
  url: "https://example.com/skills/my-skill/SKILL.md"
});
```

The SKILL.md format follows the same frontmatter + markdown body pattern as built-in skills.
