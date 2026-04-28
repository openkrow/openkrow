/**
 * @openkrow/skill — Skill management package
 *
 * Skills are instruction sets that extend agent capabilities. Each skill has:
 * - name: unique identifier
 * - description: short trigger description (used in system prompt for the LLM to decide when to load)
 * - content: full SKILL.md content (loaded on demand by the skill tool)
 * - location: file path or URL to the skill's SKILL.md
 * - enabled: whether the skill is active
 *
 * The SkillManager:
 * 1. Manages installed skills (install/uninstall/enable/disable)
 * 2. Provides skill descriptions for prompt injection (so LLM knows what skills are available)
 * 3. Loads full skill content on demand (when the skill tool is invoked)
 * 4. Ships with built-in skill definitions (pdf, docx, xlsx, pptx) that can be installed
 */

export { SkillManager } from "./skill-manager.js";
export type { Skill, SkillDefinition, SkillContent, SkillSource } from "./types.js";
export { BUILTIN_SKILLS } from "./builtins.js";
export { parseSkillFrontmatter } from "./parser.js";
