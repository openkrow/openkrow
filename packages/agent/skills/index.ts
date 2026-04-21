/**
 * SkillManager — Manages agent skills.
 */

export interface Skill {
  name: string;
  description: string;
  enabled: boolean;
}

export class SkillManager {
  private skills = new Map<string, Skill>();

  install(skill: Skill): void {
    this.skills.set(skill.name, skill);
  }

  uninstall(name: string): void {
    this.skills.delete(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }
}
