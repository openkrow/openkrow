/**
 * @openkrow/mom - Slack bot that delegates messages to the coding agent.
 *
 * "Mom" manages incoming Slack messages and routes them to
 * the appropriate agent instance for processing.
 */

import App from "@slack/bolt";
import { Agent } from "@openkrow/agent";
import type { LLMConfig } from "@openkrow/ai";

const SYSTEM_PROMPT = `You are OpenKrow, a helpful coding assistant available via Slack.
You help developers with code reviews, debugging, and answering programming questions.
Keep responses concise and formatted for Slack (use code blocks with backticks).`;

function createAgent(): Agent {
  const llmConfig: LLMConfig = {
    provider: (process.env.LLM_PROVIDER as LLMConfig["provider"]) ?? "anthropic",
    model: process.env.LLM_MODEL ?? "claude-sonnet-4-20250514",
    apiKey: process.env.LLM_API_KEY,
    maxTokens: 4096,
  };

  return new Agent({
    name: "openkrow-slack",
    description: "Slack coding assistant",
    systemPrompt: SYSTEM_PROMPT,
    llm: llmConfig,
    maxTurns: 5,
  });
}

async function main(): Promise<void> {
  const app = new App.default({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: true,
  });

  // Handle direct messages and mentions
  app.message(async ({ message, say }) => {
    if (!("text" in message) || !message.text) return;

    const agent = createAgent();

    try {
      // Send a "thinking" indicator
      const thinking = await say("_Thinking..._");

      const response = await agent.run(message.text);

      // Update the thinking message with the actual response
      if (thinking && "ts" in thinking) {
        await say({
          text: response,
          thread_ts:
            "thread_ts" in message ? message.thread_ts : message.ts,
        });
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "An error occurred";
      await say(`Sorry, I encountered an error: ${msg}`);
    }
  });

  app.event("app_mention", async ({ event, say }) => {
    const agent = createAgent();

    try {
      const response = await agent.run(event.text);
      await say({
        text: response,
        thread_ts: event.thread_ts ?? event.ts,
      });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "An error occurred";
      await say(`Sorry, I encountered an error: ${msg}`);
    }
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  await app.start(port);
  console.log(`OpenKrow Slack bot is running on port ${port}`);
}

main().catch(console.error);
