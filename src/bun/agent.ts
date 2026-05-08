import type { AgentConfig } from "@opencode-ai/sdk";
import KROW_PROMPT from "../../prompts/krow.txt"

export const krowAgent: AgentConfig = {
  prompt: KROW_PROMPT,
  mode: "primary",
  permission: {
    "question": "allow"
  } as any,
  temperature: 0.0,
};

