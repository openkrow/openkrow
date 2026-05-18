import type { AgentConfig } from "@opencode-ai/sdk/v2";
import OPERATIONS_PROMPT from "../../prompts/operations.txt";

export const operationsAgent: AgentConfig = {
  prompt: OPERATIONS_PROMPT,
  mode: "subagent",
  description: "Handles project management, process documentation, SOPs, and operational workflows",
  color: "#6B7280",
  tools: {
    skill: true,
    task: false,
    read: true,
    edit: true,
    webfetch: true,
    glob: true,
    grep: true,
    bash: true,
  },
  permission: {
    skill: {
      "ops-*": "allow",
      "*": "deny",
    },
    read: "allow",
    edit: "allow",
    bash: "ask",
    question: "allow",
  } as any,
  temperature: 0.1,
};
