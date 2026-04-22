import { Agent } from "@openkrow/agent";
import type { LLMConfig } from "@openkrow/llm";
import { createDefaultTools } from "./tools/index.js";

const DEFAULT_SYSTEM_PROMPT = `You are OpenKrow, an expert coding assistant running in the user's terminal.
You have access to tools for reading files, writing files, running shell commands, and searching codebases.

Guidelines:
- Be concise and direct in your responses
- When modifying code, show the changes clearly
- Always explain what you're doing before using tools
- If you're unsure, ask for clarification
- Respect the user's codebase conventions and style`;

export interface CodingAgentConfig {
  provider: string;
  model: string;
  systemPrompt?: string;
  enableTools?: boolean;
  apiKey?: string;
}

export class CodingAgent {
  private agent: Agent;

  constructor(config: CodingAgentConfig) {
    const llmConfig: LLMConfig = {
      provider: config.provider as LLMConfig["provider"],
      model: config.model,
      apiKey: config.apiKey,
      maxTokens: 4096,
      temperature: 0,
    };

    this.agent = new Agent({
      name: "openkrow",
      description: "Interactive coding agent",
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      llm: llmConfig,
      maxTurns: 20,
    });

    if (config.enableTools !== false) {
      const tools = createDefaultTools();
      for (const tool of tools) {
        this.agent.tools.register(tool);
      }
    }
  }

  async run(prompt: string): Promise<string> {
    return this.agent.run(prompt);
  }

  stream(prompt: string): AsyncIterable<string> {
    return this.agent.stream(prompt);
  }

  getAgent(): Agent {
    return this.agent;
  }
}
