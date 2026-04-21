/**
 * PersonalityManager — Manages user personality profile.
 */

export interface UserPersonality {
  style: "concise" | "detailed";
  expertise: "beginner" | "intermediate" | "expert";
}

export class PersonalityManager {
  private personality: UserPersonality | null = null;

  load(): UserPersonality | null {
    return this.personality;
  }

  save(personality: UserPersonality): void {
    this.personality = personality;
  }

  getDefault(): UserPersonality {
    return { style: "concise", expertise: "intermediate" };
  }
}
