import type { AgentConfig } from "@opencode-ai/sdk/v2";
import LEGAL_PROMPT from "../../prompts/legal.txt";

export const legalAgent: AgentConfig = {
  prompt: LEGAL_PROMPT,
  mode: "subagent",
  description: "Handles legal review, contracts, compliance, privacy policies, and terms of service",
  color: "#8B5CF6",
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
      "legal-*": "allow",
      "*": "deny",
    },
    read: "allow",
    edit: "ask",
    question: "allow",
  } as any,
  temperature: 0.1,
};
