/**
 * SkillManager — Central skill management.
 *
 * Responsibilities:
 * 1. Registry of installed skills (in-memory)
 * 2. Load skill content on demand (from file, URL, or inline)
 * 3. Generate prompt snippet listing available skills for system prompt injection
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Skill, SkillDefinition, SkillContent, SkillSource } from "./types.js";
import { parseSkillFrontmatter } from "./parser.js";

export class SkillManager {
  private skills = new Map<string, Skill>();

  /** Install a skill from a definition. Enabled by default. */
  install(def: SkillDefinition): void {
    this.skills.set(def.name, {
      name: def.name,
      description: def.description,
      source: def.source,
      enabled: true,
    });
  }

  /** Install a skill with just name + description (no loadable content). */
  installSimple(name: string, description: string): void {
    this.install({ name, description, source: { type: "inline", content: description } });
  }

  uninstall(name: string): boolean {
    return this.skills.delete(name);
  }

  enable(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = true;
    return true;
  }

  disable(name: string): boolean {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = false;
    return true;
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  listEnabled(): Skill[] {
    return this.list().filter((s) => s.enabled);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Generate the prompt snippet that lists available skills.
   * This is injected into the system prompt so the LLM knows what skills exist
   * and can invoke the skill tool to load them.
   *
   * Returns empty string if no enabled skills.
   */
  getPromptSnippet(): string {
    const enabled = this.listEnabled();
    if (enabled.length === 0) return "";

    const lines = [
      "Skills provide specialized instructions and workflows for specific tasks.",
      "Use the skill tool to load a skill when a task matches its description.",
      "<available_skills>",
    ];

    for (const skill of enabled) {
      lines.push("  <skill>");
      lines.push(`    <name>${skill.name}</name>`);
      lines.push(`    <description>${skill.description}</description>`);
      if (skill.source.type === "file") {
        lines.push(`    <location>${skill.source.path}</location>`);
      } else if (skill.source.type === "url") {
        lines.push(`    <location>${skill.source.url}</location>`);
      }
      lines.push("  </skill>");
    }

    lines.push("</available_skills>");
    return lines.join("\n");
  }

  /**
   * Load full skill content by name. Used by the skill tool.
   * Reads from file, fetches from URL, or returns inline content.
   */
  async loadContent(name: string): Promise<SkillContent | undefined> {
    const skill = this.skills.get(name);
    if (!skill || !skill.enabled) return undefined;

    try {
      const raw = await this.readSource(skill.source);
      const parsed = parseSkillFrontmatter(raw);

      return {
        name: skill.name,
        content: parsed ? parsed.content : raw,
        directory: skill.source.type === "file" ? dirname(skill.source.path) : undefined,
      };
    } catch {
      return undefined;
    }
  }

  private async readSource(source: SkillSource): Promise<string> {
    switch (source.type) {
      case "inline":
        return source.content;
      case "file":
        return readFileSync(source.path, "utf-8");
      case "url": {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
        return response.text();
      }
    }
  }
}
