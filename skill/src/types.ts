/**
 * Skill types
 */

/** Where the skill content comes from */
export type SkillSource =
  | { type: "file"; path: string }
  | { type: "url"; url: string }
  | { type: "inline"; content: string };

/** Minimal skill definition — enough to install a skill */
export interface SkillDefinition {
  name: string;
  description: string;
  source: SkillSource;
}

/** A fully installed skill in the manager */
export interface Skill {
  name: string;
  description: string;
  source: SkillSource;
  enabled: boolean;
}

/** Loaded skill content returned by the skill tool */
export interface SkillContent {
  name: string;
  content: string;
  directory?: string;
}
