import type { AgentConfig } from "@opencode-ai/sdk/v2";
import MARKETING_PROMPT from "../../prompts/marketing.txt";

export const marketingAgent: AgentConfig = {
  prompt: MARKETING_PROMPT,
  mode: "subagent",
  description: "Handles marketing strategy, content creation, SEO, campaigns, and social media",
  color: "#F97316",
  tools: {
    skill: true,
    task: false,
    read: true,
    edit: true,
    webfetch: true,
    glob: true,
    grep: true,
    bash: false,
  },
  permission: {
    skill: {
      "marketing-*": "allow",
      "frontend-design": "allow",
      "*": "deny",
    },
    read: "allow",
    edit: "ask",
    question: "allow",
  } as any,
  temperature: 0.3,
};
