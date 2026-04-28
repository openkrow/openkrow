/**
 * Prompt assembly — Loads and composes the system prompt for the agent.
 *
 * Prompt files are stored as .txt in this directory. Since tsc does not copy
 * non-TS files, we read them at runtime using fs + import.meta.url.
 *
 * The prompt is composed from:
 *   1. default.txt — base prompt (always included)
 *   2. {provider}.txt — provider-specific additions (anthropic, gpt, gemini)
 *   3. tools.txt — tool usage instructions (included when tools are registered)
 *   4. Custom suffix — optional user/agent-specific additions
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { KnownProvider } from "@mariozechner/pi-ai";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Works both from source (context/) and from dist (dist/context/) because
// the build step copies prompt/ into dist/context/prompt/
const PROMPT_DIR = resolve(__dirname, "prompt");

function loadPromptFile(name: string): string {
  try {
    return readFileSync(resolve(PROMPT_DIR, name), "utf-8").trim();
  } catch {
    return "";
  }
}

const providerPromptMap: Partial<Record<KnownProvider, string>> = {
  anthropic: "anthropic.txt",
  openai: "gpt.txt",
  "github-copilot": "gpt.txt",
  xai: "gpt.txt",
  groq: "gpt.txt",
  deepseek: "gpt.txt",
  openrouter: "gpt.txt",
  google: "gemini.txt",
};

export interface PromptAssemblyOptions {
  /** The LLM provider, used to select provider-specific prompt additions */
  provider?: KnownProvider;
  /** Whether tools are available (includes tool usage instructions) */
  hasTools?: boolean;
  /** Optional custom suffix appended to the prompt */
  customSuffix?: string;
  /** User's name, injected into the prompt if provided */
  userName?: string;
  /** Current date string for context */
  currentDate?: string;
  /** Workspace context content (from context.md), appended as a dedicated section */
  workspaceContext?: string;
  /** Workspace path, shown in environment section */
  workspacePath?: string;
  /** Skills prompt snippet (available skills listing), injected before custom suffix */
  skillsSnippet?: string;
}

/**
 * Assemble the complete system prompt from prompt fragments.
 * This is the single source of truth for the system prompt.
 */
export function assembleSystemPrompt(options: PromptAssemblyOptions = {}): string {
  const {
    provider,
    hasTools = false,
    customSuffix,
    userName,
    workspaceContext,
    workspacePath,
    skillsSnippet,
    currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  } = options;

  const sections: string[] = [];

  // 1. Base prompt (always)
  const base = loadPromptFile("default.txt");
  if (base) sections.push(base);

  // 2. Provider-specific
  if (provider) {
    const providerFile = providerPromptMap[provider];
    if (providerFile) {
      const providerPrompt = loadPromptFile(providerFile);
      if (providerPrompt) sections.push(providerPrompt);
    }
  }

  // 3. Tool instructions
  if (hasTools) {
    const toolsPrompt = loadPromptFile("tools.txt");
    if (toolsPrompt) sections.push(toolsPrompt);
  }

  // 4. Environment context
  const envLines: string[] = [];
  if (userName) envLines.push(`The user's name is ${userName}.`);
  envLines.push(`Today's date is ${currentDate}.`);
  if (workspacePath) envLines.push(`Workspace path: ${workspacePath}`);
  if (envLines.length > 0) {
    sections.push(`# Environment\n${envLines.join("\n")}`);
  }

  // 5. Workspace context (from context.md)
  if (workspaceContext?.trim()) {
    sections.push(`# Workspace Context\n${workspaceContext.trim()}`);
  }

  // 6. Skills listing
  if (skillsSnippet?.trim()) {
    sections.push(skillsSnippet.trim());
  }

  // 7. Custom suffix
  if (customSuffix?.trim()) {
    sections.push(customSuffix.trim());
  }

  return sections.join("\n\n");
}
