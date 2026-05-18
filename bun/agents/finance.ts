import type { AgentConfig } from "@opencode-ai/sdk/v2";
import FINANCE_PROMPT from "../../prompts/finance.txt";

export const financeAgent: AgentConfig = {
  prompt: FINANCE_PROMPT,
  mode: "subagent",
  description: "Handles financial modeling, budgets, invoicing, forecasting, and accounting",
  color: "#06B6D4",
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
      "finance-*": "allow",
      "*": "deny",
    },
    read: "allow",
    edit: "ask",
    question: "allow",
  } as any,
  temperature: 0.0,
};
