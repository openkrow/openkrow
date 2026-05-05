import { describe, test, expect } from "bun:test";
import { SkillManager } from "../skill-manager.js";
import { parseSkillFrontmatter } from "../parser.js";
import { BUILTIN_SKILLS } from "../builtins.js";
import type { SkillDefinition } from "../types.js";

// ---------------------------------------------------------------------------
// parseSkillFrontmatter
// ---------------------------------------------------------------------------

describe("parseSkillFrontmatter", () => {
  test("parses valid frontmatter", () => {
    const raw = `---
name: pdf
description: PDF processing skill
---
# PDF Guide

Some content here.`;

    const result = parseSkillFrontmatter(raw);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("pdf");
    expect(result!.description).toBe("PDF processing skill");
    expect(result!.content).toContain("# PDF Guide");
  });

  test("handles quoted values", () => {
    const raw = `---
name: docx
description: "Create and edit Word documents"
---
Content`;

    const result = parseSkillFrontmatter(raw);
    expect(result!.description).toBe("Create and edit Word documents");
  });

  test("returns null for missing frontmatter", () => {
    expect(parseSkillFrontmatter("# Just content")).toBeNull();
  });

  test("returns null for missing name", () => {
    const raw = `---
description: No name
---
Content`;
    expect(parseSkillFrontmatter(raw)).toBeNull();
  });

  test("returns null for unclosed frontmatter", () => {
    const raw = `---
name: broken
description: No closing`;
    expect(parseSkillFrontmatter(raw)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SkillManager
// ---------------------------------------------------------------------------

describe("SkillManager", () => {
  function createManager(): SkillManager {
    return new SkillManager();
  }

  const testSkill: SkillDefinition = {
    name: "test-skill",
    description: "A test skill",
    source: { type: "inline", content: "# Test\n\nTest content here." },
  };

  test("install and get", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    const skill = mgr.get("test-skill");
    expect(skill).toBeDefined();
    expect(skill!.name).toBe("test-skill");
    expect(skill!.enabled).toBe(true);
  });

  test("installSimple", () => {
    const mgr = createManager();
    mgr.installSimple("simple", "A simple skill");
    expect(mgr.has("simple")).toBe(true);
    expect(mgr.get("simple")!.description).toBe("A simple skill");
  });

  test("uninstall", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    expect(mgr.uninstall("test-skill")).toBe(true);
    expect(mgr.has("test-skill")).toBe(false);
    expect(mgr.uninstall("nonexistent")).toBe(false);
  });

  test("enable/disable", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    expect(mgr.disable("test-skill")).toBe(true);
    expect(mgr.get("test-skill")!.enabled).toBe(false);
    expect(mgr.listEnabled()).toHaveLength(0);

    expect(mgr.enable("test-skill")).toBe(true);
    expect(mgr.get("test-skill")!.enabled).toBe(true);
    expect(mgr.listEnabled()).toHaveLength(1);
  });

  test("enable/disable returns false for missing skill", () => {
    const mgr = createManager();
    expect(mgr.enable("nope")).toBe(false);
    expect(mgr.disable("nope")).toBe(false);
  });

  test("list returns all skills", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    mgr.install({ name: "other", description: "Other", source: { type: "inline", content: "" } });
    expect(mgr.list()).toHaveLength(2);
  });

  test("listEnabled filters disabled", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    mgr.install({ name: "disabled-one", description: "Disabled", source: { type: "inline", content: "" } });
    mgr.disable("disabled-one");
    const enabled = mgr.listEnabled();
    expect(enabled).toHaveLength(1);
    expect(enabled[0]!.name).toBe("test-skill");
  });

  test("getPromptSnippet returns empty for no skills", () => {
    const mgr = createManager();
    expect(mgr.getPromptSnippet()).toBe("");
  });

  test("getPromptSnippet returns empty when all disabled", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    mgr.disable("test-skill");
    expect(mgr.getPromptSnippet()).toBe("");
  });

  test("getPromptSnippet includes enabled skills", () => {
    const mgr = createManager();
    mgr.install(testSkill);
    const snippet = mgr.getPromptSnippet();
    expect(snippet).toContain("<available_skills>");
    expect(snippet).toContain("<name>test-skill</name>");
    expect(snippet).toContain("<description>A test skill</description>");
    expect(snippet).toContain("</available_skills>");
  });

  test("getPromptSnippet includes location for file source", () => {
    const mgr = createManager();
    mgr.install({
      name: "file-skill",
      description: "File-based",
      source: { type: "file", path: "/path/to/SKILL.md" },
    });
    const snippet = mgr.getPromptSnippet();
    expect(snippet).toContain("<location>/path/to/SKILL.md</location>");
  });

  test("getPromptSnippet includes location for url source", () => {
    const mgr = createManager();
    mgr.install({
      name: "url-skill",
      description: "URL-based",
      source: { type: "url", url: "https://example.com/SKILL.md" },
    });
    const snippet = mgr.getPromptSnippet();
    expect(snippet).toContain("<location>https://example.com/SKILL.md</location>");
  });

  test("loadContent for inline skill", async () => {
    const mgr = createManager();
    mgr.install(testSkill);
    const content = await mgr.loadContent("test-skill");
    expect(content).toBeDefined();
    expect(content!.name).toBe("test-skill");
    expect(content!.content).toBe("# Test\n\nTest content here.");
  });

  test("loadContent returns undefined for missing skill", async () => {
    const mgr = createManager();
    expect(await mgr.loadContent("nope")).toBeUndefined();
  });

  test("loadContent returns undefined for disabled skill", async () => {
    const mgr = createManager();
    mgr.install(testSkill);
    mgr.disable("test-skill");
    expect(await mgr.loadContent("test-skill")).toBeUndefined();
  });

  test("loadContent parses frontmatter from inline content", async () => {
    const mgr = createManager();
    mgr.install({
      name: "fm-skill",
      description: "Has frontmatter",
      source: {
        type: "inline",
        content: `---
name: fm-skill
description: Has frontmatter
---
# The actual content

Body here.`,
      },
    });
    const content = await mgr.loadContent("fm-skill");
    expect(content).toBeDefined();
    expect(content!.content).toContain("# The actual content");
    expect(content!.content).not.toContain("---");
  });
});

// ---------------------------------------------------------------------------
// Builtins
// ---------------------------------------------------------------------------

describe("BUILTIN_SKILLS", () => {
  test("has 4 built-in skills", () => {
    expect(BUILTIN_SKILLS).toHaveLength(4);
  });

  test("all have name, description, and url source", () => {
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.source.type).toBe("url");
    }
  });

  test("includes pdf, docx, xlsx, pptx", () => {
    const names = BUILTIN_SKILLS.map((s) => s.name);
    expect(names).toContain("pdf");
    expect(names).toContain("docx");
    expect(names).toContain("xlsx");
    expect(names).toContain("pptx");
  });
});
