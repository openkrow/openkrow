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
  type ApiKeySetRequest,
  type ApiKeyListResponse,
  type ModelConfigResponse,
  type ModelConfigSetRequest,
  type ModelListResponse,
} from "./types.js";
import { VERSION } from "../version.js";

/** Helper accessor for the ConfigManager through the orchestrator. */
const cm = (o: Orchestrator) => o.configManager;

export interface OpenKrowServerOptions {
  config?: Partial<ServerConfig>;
  /** Workspace directory path */
  workspacePath?: string;
  /** API key to secure the server. All requests must include this in the Authorization header. In-memory only. */
  serverApiKey?: string;
}

/**
 * OpenKrow Server
 */
export class OpenKrowServer {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private orchestrator: Orchestrator;
  private config: ServerConfig;
  private workspacePath: string;
  private serverApiKey: string | undefined;
  private startTime: number = Date.now();

  constructor(options: OpenKrowServerOptions = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...options.config };
    this.workspacePath = options.workspacePath ?? process.cwd();
    this.serverApiKey = options.serverApiKey;

    // Initialize orchestrator — LLM config is resolved from ConfigManager at runtime
    this.orchestrator = Orchestrator.create({
      workspacePath: this.workspacePath,
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
          // Health endpoint (no auth required)
          if (path === "/health" || path === `${self.config.apiPrefix}/health`) {
            const health: HealthResponse = {
              status: "ok",
              version: VERSION,
              uptime: Date.now() - self.startTime,
            };
            return Response.json(health, { headers: corsHeaders });
          }

          // --- Auth gate: all other routes require the server API key ---
          if (self.serverApiKey) {
            const authHeader = req.headers.get("authorization");
            const token = authHeader?.startsWith("Bearer ")
              ? authHeader.slice(7)
              : null;

            if (token !== self.serverApiKey) {
              return Response.json(
                { error: "Unauthorized", code: "UNAUTHORIZED" } as ErrorResponse,
                { status: 401, headers: corsHeaders }
              );
            }
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
            );

            return Response.json(response, { headers: corsHeaders });
          }

          // Cancel endpoint
          if (
            path === "/chat/cancel" ||
            path === `${self.config.apiPrefix}/chat/cancel`
          ) {
            if (req.method !== "POST") {
              return Response.json(
                { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" } as ErrorResponse,
                { status: 405, headers: corsHeaders }
              );
            }

            const body = await req.json().catch(() => null);
            if (
              !body ||
              typeof body !== "object" ||
              !("conversationId" in body) ||
              typeof (body as { conversationId: string }).conversationId !== "string"
            ) {
              return Response.json(
                { error: "conversationId is required", code: "INVALID_BODY" } as ErrorResponse,
                { status: 400, headers: corsHeaders }
              );
            }

            const cancelled = self.orchestrator.cancelRequest(
              (body as { conversationId: string }).conversationId
            );

            return Response.json(
              { ok: true, cancelled },
              { headers: corsHeaders }
            );
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

          // ---------------------------------------------------------------
          // Auth: API Key management
          // ---------------------------------------------------------------

          // GET /auth/keys — list stored API keys (masked)
          if (
            (path === "/auth/keys" || path === `${self.config.apiPrefix}/auth/keys`) &&
            req.method === "GET"
          ) {
            const keys = cm(self.orchestrator).listApiKeys();
            return Response.json({ keys } as ApiKeyListResponse, { headers: corsHeaders });
          }

          // POST /auth/keys — store an API key for a provider
          if (
            (path === "/auth/keys" || path === `${self.config.apiPrefix}/auth/keys`) &&
            req.method === "POST"
          ) {
            const body = await req.json().catch(() => null);
            if (
              !body ||
              typeof body !== "object" ||
              !("provider" in body) ||
              !("apiKey" in body) ||
              typeof (body as ApiKeySetRequest).provider !== "string" ||
              typeof (body as ApiKeySetRequest).apiKey !== "string"
            ) {
              return Response.json(
                { error: "provider and apiKey are required strings", code: "INVALID_BODY" } as ErrorResponse,
                { status: 400, headers: corsHeaders }
              );
            }
            const { provider: prov, apiKey: key } = body as ApiKeySetRequest;
            cm(self.orchestrator).setApiKey(prov, key);
            return Response.json({ ok: true, provider: prov }, { headers: corsHeaders });
          }

          // DELETE /auth/keys/:provider — remove an API key
          const deleteKeyMatch = path.match(/^(?:\/api)?\/auth\/keys\/([^/]+)$/);
          if (deleteKeyMatch && req.method === "DELETE") {
            const provider = deleteKeyMatch[1];
            const deleted = cm(self.orchestrator).removeApiKey(provider);
            if (!deleted) {
              return Response.json(
                { error: `No API key stored for provider: ${provider}`, code: "NOT_FOUND" } as ErrorResponse,
                { status: 404, headers: corsHeaders }
              );
            }
            return Response.json({ ok: true, provider }, { headers: corsHeaders });
          }

          // ---------------------------------------------------------------
          // Model configuration
          // ---------------------------------------------------------------

          // GET /models — list all available models
          if (
            (path === "/models" || path === `${self.config.apiPrefix}/models`) &&
            req.method === "GET"
          ) {
            const allModels = cm(self.orchestrator).listModels();
            const providers = cm(self.orchestrator).listProviders();
            const response: ModelListResponse = {
              models: allModels.map((m: { id: string; name: string; provider: string; contextWindow: number; maxTokens: number; reasoning: boolean }) => ({
                id: m.id,
                name: m.name,
                provider: m.provider,
                contextWindow: m.contextWindow,
                maxTokens: m.maxTokens,
                reasoning: m.reasoning,
              })),
              providers: providers as string[],
            };
            return Response.json(response, { headers: corsHeaders });
          }

          // GET /config/model — get current model config
          if (
            (path === "/config/model" || path === `${self.config.apiPrefix}/config/model`) &&
            req.method === "GET"
          ) {
            const active = cm(self.orchestrator).getActiveModel();
            return Response.json(active as ModelConfigResponse, { headers: corsHeaders });
          }

          // POST /config/model — set current model config
          if (
            (path === "/config/model" || path === `${self.config.apiPrefix}/config/model`) &&
            req.method === "POST"
          ) {
            const body = await req.json().catch(() => null);
            if (
              !body ||
              typeof body !== "object" ||
              !("provider" in body) ||
              !("model" in body) ||
              typeof (body as ModelConfigSetRequest).provider !== "string" ||
              typeof (body as ModelConfigSetRequest).model !== "string"
            ) {
              return Response.json(
                { error: "provider and model are required strings", code: "INVALID_BODY" } as ErrorResponse,
                { status: 400, headers: corsHeaders }
              );
            }
            const { provider: prov, model: mod } = body as ModelConfigSetRequest;
            cm(self.orchestrator).setActiveModel({ provider: prov as any, model: mod });
            return Response.json({ ok: true, provider: prov, model: mod }, { headers: corsHeaders });
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
    console.log(`Auth: ${this.serverApiKey ? "enabled (Bearer token required)" : "disabled"}`);
    console.log(`\nEndpoints:`);
    console.log(`  GET  /health                       - Health check (no auth)`);
    console.log(`  POST /chat                         - Send a message`);
    console.log(`  POST /chat/cancel                  - Cancel active request`);
    console.log(`  GET  /conversations                - List conversations`);
    console.log(`  GET  /conversations/:id/messages    - Conversation history`);
    console.log(`  GET  /auth/keys                    - List stored API keys`);
    console.log(`  POST /auth/keys                    - Store an API key`);
    console.log(`  DELETE /auth/keys/:provider         - Remove an API key`);
    console.log(`  GET  /models                       - List available models`);
    console.log(`  GET  /config/model                 - Get current model`);
    console.log(`  POST /config/model                 - Set current model`);

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
