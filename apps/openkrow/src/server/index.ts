/**
 * OpenKrow Bun HTTP Server
 *
 * Main server that provides the /chat endpoint for interacting with the agent.
 */

import { Orchestrator } from "../orchestrator/index.js";
import {
  handleChat,
  handleStreamChat,
  validateChatRequest,
} from "./handlers.js";
import {
  DEFAULT_SERVER_CONFIG,
  type ServerConfig,
  type HealthResponse,
  type ErrorResponse,
} from "./types.js";
import { VERSION } from "../version.js";

const SYSTEM_PROMPT = `You are OpenKrow, an expert AI coding assistant running in the user's terminal.

You have access to tools for reading files, writing files, executing shell commands,
searching codebases, and listing directory contents.

Principles:
- Be concise and direct. Terminal space is limited.
- Explain your reasoning before taking actions.
- When editing code, describe the change, then apply it.
- Ask for clarification when the request is ambiguous.
- Respect the existing codebase style and conventions.
- Never execute destructive commands without explicit user confirmation.
- When showing code, use the minimal diff needed -- don't reprint entire files.`;

export interface OpenKrowServerOptions {
  config?: Partial<ServerConfig>;
  workspacePath?: string;
  apiKey?: string;
  provider?: "openai" | "anthropic" | "google";
  model?: string;
}

/**
 * OpenKrow Server
 */
export class OpenKrowServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private orchestrator: Orchestrator;
  private config: ServerConfig;
  private workspacePath: string;
  private startTime: number = Date.now();

  constructor(options: OpenKrowServerOptions = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...options.config };
    this.workspacePath = options.workspacePath ?? process.cwd();

    // Initialize orchestrator
    this.orchestrator = Orchestrator.create({
      systemPrompt: SYSTEM_PROMPT,
      llm: {
        provider: options.provider ?? "anthropic",
        model: options.model ?? "claude-sonnet-4-20250514",
        apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY,
      },
      enableTools: true,
    });
  }

  /**
   * Start the server
   */
  start(): ReturnType<typeof Bun.serve> {
    const self = this;

    this.server = Bun.serve({
      port: this.config.port,
      hostname: this.config.host,

      async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders: Record<string, string> = self.config.cors
          ? {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }
          : {};

        // Handle CORS preflight
        if (req.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: corsHeaders });
        }

        try {
          // Health endpoint
          if (path === "/health" || path === `${self.config.apiPrefix}/health`) {
            const health: HealthResponse = {
              status: "ok",
              version: VERSION,
              uptime: Date.now() - self.startTime,
            };
            return Response.json(health, { headers: corsHeaders });
          }

          // Chat endpoint
          if (
            path === "/chat" ||
            path === `${self.config.apiPrefix}/chat`
          ) {
            if (req.method !== "POST") {
              return Response.json(
                { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } as ErrorResponse,
                { status: 405, headers: corsHeaders }
              );
            }

            const body = await req.json().catch(() => null);
            const validation = validateChatRequest(body);

            if (!validation.valid) {
              return Response.json(validation.error, {
                status: 400,
                headers: corsHeaders,
              });
            }

            const chatRequest = validation.data;

            // Handle streaming response
            if (chatRequest.stream) {
              const stream = new ReadableStream({
                async start(controller) {
                  try {
                    const generator = handleStreamChat(
                      self.orchestrator,
                      chatRequest,
                      self.workspacePath
                    );

                    for await (const chunk of generator) {
                      const data = JSON.stringify({ type: "chunk", content: chunk });
                      controller.enqueue(new TextEncoder().encode(`data: ${data}\n\n`));
                    }

                    // Send done event
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
                    );
                    controller.close();
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : "Unknown error";
                    controller.enqueue(
                      new TextEncoder().encode(
                        `data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`
                      )
                    );
                    controller.close();
                  }
                },
              });

              return new Response(stream, {
                headers: {
                  ...corsHeaders,
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                },
              });
            }

            // Handle non-streaming response
            const response = await handleChat(
              self.orchestrator,
              chatRequest,
              self.workspacePath
            );

            return Response.json(response, { headers: corsHeaders });
          }

          // Conversations list endpoint
          if (
            path === "/conversations" ||
            path === `${self.config.apiPrefix}/conversations`
          ) {
            if (req.method !== "GET") {
              return Response.json(
                { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } as ErrorResponse,
                { status: 405, headers: corsHeaders }
              );
            }

            const limit = parseInt(url.searchParams.get("limit") ?? "10", 10);
            const conversations = self.orchestrator.getRecentConversations(limit);

            return Response.json({ conversations }, { headers: corsHeaders });
          }

          // Conversation history endpoint
          const historyMatch = path.match(/^(?:\/api)?\/conversations\/([^/]+)\/messages$/);
          if (historyMatch) {
            if (req.method !== "GET") {
              return Response.json(
                { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } as ErrorResponse,
                { status: 405, headers: corsHeaders }
              );
            }

            const conversationId = historyMatch[1];
            const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
            const messages = self.orchestrator.getConversationHistory(conversationId, limit);

            return Response.json({ messages }, { headers: corsHeaders });
          }

          // 404 for unknown routes
          return Response.json(
            { error: "Not found", code: "NOT_FOUND" } as ErrorResponse,
            { status: 404, headers: corsHeaders }
          );
        } catch (error) {
          console.error("Server error:", error);
          const errorMsg = error instanceof Error ? error.message : "Internal server error";
          return Response.json(
            { error: errorMsg, code: "INTERNAL_ERROR" } as ErrorResponse,
            { status: 500, headers: corsHeaders }
          );
        }
      },
    });

    console.log(`OpenKrow server started on http://${this.config.host}:${this.config.port}`);
    console.log(`Workspace: ${this.workspacePath}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /chat - Send a message to the agent`);
    console.log(`  GET  /health - Health check`);
    console.log(`  GET  /conversations - List recent conversations`);
    console.log(`  GET  /conversations/:id/messages - Get conversation history`);

    return this.server;
  }

  /**
   * Stop the server
   */
  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    this.orchestrator.cleanup();
    console.log("OpenKrow server stopped");
  }

  /**
   * Get server info
   */
  getInfo() {
    return {
      running: this.server !== null,
      config: this.config,
      workspacePath: this.workspacePath,
      activeAgents: this.orchestrator.getActiveAgentsCount(),
      uptime: Date.now() - this.startTime,
    };
  }
}

/**
 * Create and start the server (convenience function)
 */
export function startServer(options?: OpenKrowServerOptions): OpenKrowServer {
  const server = new OpenKrowServer(options);
  server.start();
  return server;
}
