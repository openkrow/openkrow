import type { AgentConfig } from "@opencode-ai/sdk/v2";
import DEVELOPMENT_PROMPT from "../../prompts/development.txt";

export const developmentAgent: AgentConfig = {
  prompt: DEVELOPMENT_PROMPT,
  mode: "subagent",
  description: "Handles software development, code reviews, architecture, and technical implementation",
  color: "#10B981",
  tools: {
    skill: true,
    task: false,
    read: true,
    edit: true,
    bash: true,
    glob: true,
    grep: true,
    webfetch: true,
  },
  permission: {
    skill: {
      "dev-*": "allow",
      "frontend-design": "allow",
      "*": "deny",
    },
    read: "allow",
    edit: "allow",
    bash: "ask",
    question: "allow",
  } as any,
  temperature: 0.0,
};
