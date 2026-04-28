/**
 * SKILL.md frontmatter parser
 *
 * Parses YAML-like frontmatter from SKILL.md files:
 * ---
 * name: skill-name
 * description: Short description
 * ---
 * # Full content...
 */

export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
}

/**
 * Parse a SKILL.md file's raw text into frontmatter fields + body content.
 */
export function parseSkillFrontmatter(raw: string): ParsedSkill | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) return null;

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) return null;

  const frontmatter = trimmed.slice(3, endIndex).trim();
  const body = trimmed.slice(endIndex + 3).trim();

  let name = "";
  let description = "";

  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    // Remove surrounding quotes from value
    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "name") name = value;
    else if (key === "description") description = value;
  }

  if (!name) return null;

  return { name, description, content: body };
}
