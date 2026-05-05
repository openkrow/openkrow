/**
 * SkillTool — Load a specialized skill by name.
 *
 * Delegates to the SkillManager to find the skill and load its content.
 * Skill management (install, discovery) is handled by @openkrow/skill.
 */

import { createTool, loadDescription, ok, fail } from "./create-tool.js";
import type { Tool } from "../types/index.js";
import type { SkillManager } from "../../skill/src/index.js";

const DESCRIPTION = loadDescription(import.meta.url, "skill.txt");

export function createSkillTool(skillManager: SkillManager): Tool {
  return createTool({
    name: "skill",
    description: DESCRIPTION,
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the skill from available_skills",
        },
      },
      required: ["name"],
    },
    execute: async (args) => {
      const name = args.name as string;
      if (!name) return fail("name is required");

      // Check if skill exists in the registry
      const skill = skillManager.get(name);
      if (!skill) {
        const available = skillManager.list().map((s) => s.name).join(", ");
        return fail(`Skill "${name}" not found. Available skills: ${available || "none"}`);
      }

      if (!skill.enabled) {
        return fail(`Skill "${name}" is disabled.`);
      }

      // Load full content via SkillManager
      const content = await skillManager.loadContent(name);
      if (!content) {
        return fail(`Failed to load content for skill "${name}".`);
      }

      const output = [
        `<skill_content name="${content.name}">`,
        `# Skill: ${content.name}`,
        "",
        content.content.trim(),
        "",
        content.directory ? `Base directory for this skill: ${content.directory}` : "",
        `</skill_content>`,
      ]
        .filter(Boolean)
        .join("\n");

      return ok(output);
    },
  });
}
