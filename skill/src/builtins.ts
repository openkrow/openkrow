/**
 * Built-in skill definitions — metadata only, content loaded from source on demand.
 *
 * These map to skills from https://github.com/anthropics/skills/tree/main/skills/
 * Users install them via the API; the SkillManager fetches content from GitHub when loaded.
 */

import type { SkillDefinition } from "./types.js";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/anthropics/skills/main/skills";

export const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    name: "pdf",
    description:
      "Use this skill whenever the user wants to do anything with PDF files — reading, extracting text/tables, merging, splitting, rotating, watermarking, creating, filling forms, encrypting/decrypting, OCR.",
    source: { type: "url", url: `${GITHUB_RAW_BASE}/pdf/SKILL.md` },
  },
  {
    name: "docx",
    description:
      "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Also use for producing reports, memos, letters, or templates as Word files.",
    source: { type: "url", url: `${GITHUB_RAW_BASE}/docx/SKILL.md` },
  },
  {
    name: "xlsx",
    description:
      "Use this skill any time a spreadsheet file is the primary input or output — opening, reading, editing, creating .xlsx/.csv/.tsv files, cleaning tabular data, computing formulas, formatting, charting.",
    source: { type: "url", url: `${GITHUB_RAW_BASE}/xlsx/SKILL.md` },
  },
  {
    name: "pptx",
    description:
      "Use this skill any time a .pptx file is involved — creating slide decks, reading/parsing presentations, editing existing slides, combining/splitting slide files, working with templates and layouts.",
    source: { type: "url", url: `${GITHUB_RAW_BASE}/pptx/SKILL.md` },
  },
];
