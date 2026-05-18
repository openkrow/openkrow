import type { AgentConfig } from "@opencode-ai/sdk/v2";
import COFOUNDER_PROMPT from "../../prompts/cofounder.txt";

export const cofounderAgent: AgentConfig = {
  prompt: COFOUNDER_PROMPT,
  mode: "primary",
  description: "CoFounder — orchestrates all sub-agents, plans and delegates tasks",
  color: "#3B82F6",
  tools: {
    skill: true,
    task: true,
    read: true,
    webfetch: true,
    glob: true,
    grep: true,
    bash: false,
    edit: false,
  },
  permission: {
    skill: "allow",
    task: "allow",
    read: "allow",
    question: "allow",
  } as any,
  temperature: 0.0,
};
