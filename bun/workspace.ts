import { createOpencode } from "@opencode-ai/sdk/v2";
import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { ChatMessage, MessagePart, ProviderInfo, ProviderAuthData, ProviderAuthMethod, ProviderOAuthStart, McpServerInfo, McpLocalConfig, McpRemoteConfig } from "../shared/types";
import { agents, agentMeta } from "./agents";
import { EventStream, type RpcSend } from "./stream";

/**
 * Manages the opencode workspace lifecycle: server, session, and messaging.
 */
export class WorkspaceManager {
  private client: InstanceType<typeof OpencodeClient> | null = null;
  private abortController = new AbortController();
  private eventStream: EventStream | null = null;
  private directory: string | null = null;

  get currentDirectory(): string | null {
    return this.directory;
  }

  get isActive(): boolean {
    return this.client !== null;
  }

  /**
   * Start a workspace: boot opencode server, install skills, begin event stream.
   */
  async start(path: string): Promise<void> {
    if (this.client) {
      this.stop();
    }

    this.directory = path;
    this.abortController = new AbortController();
    process.chdir(path);

    const result = await createOpencode({
      port: 0,
      timeout: 15000,
      signal: this.abortController.signal,
      config: {
        agent: agents,
        plugin: [],
      },
    });

    this.client = result.client;
  }

  /**
   * Start the event stream (must be called after start and after RPC is available).
   */
  startEventStream(send: RpcSend): void {
    if (!this.client) throw new Error("No workspace active");
    this.eventStream = new EventStream(this.client, send);
    this.eventStream.start();
  }

  /**
   * Stop the current workspace server.
   */
  stop(): void {
    this.abortController.abort();
    this.eventStream = null;
    this.client = null;
    this.directory = null;
  }

  /**
   * Get or create a session for the current workspace directory.
   */
  async getOrCreateSession(): Promise<string> {
    if (!this.client) throw new Error("No workspace active");

    const listRes = await this.client.session.list({ directory: this.directory! });

    if (listRes.data && listRes.data.length > 0) {
      const sorted = [...listRes.data].sort((a, b) => b.time.updated - a.time.updated);
      return sorted[0].id;
    }

    const res = await this.client.session.create({});
    if (!res.data) throw new Error("Failed to create session");
    return res.data.id;
  }

  /**
   * Create a brand new session.
   */
  async createNewSession(): Promise<string> {
    if (!this.client) throw new Error("No workspace active");
    const res = await this.client.session.create({});
    if (!res.data) throw new Error("Failed to create session");
    return res.data.id;
  }

  /**
   * List all sessions for the current workspace directory.
   */
  async listSessions(): Promise<{ id: string; title: string; updatedAt: number }[]> {
    if (!this.client) throw new Error("No workspace active");

    const listRes = await this.client.session.list({ directory: this.directory! });
    if (!listRes.data) return [];

    return [...listRes.data]
      .sort((a, b) => b.time.updated - a.time.updated)
      .map((s) => ({
        id: s.id,
        title: s.title || "Untitled",
        updatedAt: s.time.updated,
      }));
  }

  /**
   * Fetch full message history for a session.
   */
  async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    if (!this.client) throw new Error("No workspace active");

    const history: ChatMessage[] = [];
    const msgRes = await this.client.session.messages({ sessionID: sessionId });
    if (!msgRes.data) return history;

    for (const msg of msgRes.data) {
      const { info, parts } = msg;

      if (info.role === "user") {
        const text = parts
          .filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join("");
        history.push({ id: info.id, role: "user", text, createdAt: info.time.created });
      } else if (info.role === "assistant") {
        const messageParts = WorkspaceManager.mapParts(parts);
        const text = messageParts
          .filter((p) => p.type === "text")
          .map((p) => (p as any).text)
          .join("");
        history.push({ id: info.id, role: "assistant", text, createdAt: info.time.created, parts: messageParts });
      }
    }

    return history;
  }

  /**
   * Send a message to a session.
   */
  async sendMessage(sessionId: string, text: string, model?: { providerID: string; modelID: string }): Promise<void> {
    if (!this.client) throw new Error("No workspace active");

    await this.client.session.promptAsync({
      sessionID: sessionId,
      agent: "cofounder",
      parts: [{ type: "text", text }],
      model: model ?? { providerID: "opencode", modelID: "big-pickle" },
    });
  }

  /**
   * Stop the active agent work for a session without stopping the opencode server.
   */
  async stopSession(sessionId: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.session.abort({ sessionID: sessionId });
  }

  /**
   * List available agents with metadata.
   */
  getAgents() {
    return agentMeta;
  }

  /**
   * Get available providers and models.
   */
  async getProviders(): Promise<{ models: { id: string; name: string; providerID: string; providerName: string }[]; currentModel: string | null }> {
    if (!this.client) throw new Error("No workspace active");

    const res = await this.client.config.providers();
    if (!res.data) throw new Error("Failed to fetch providers");

    const models: { id: string; name: string; providerID: string; providerName: string }[] = [];
    for (const provider of res.data.providers) {
      for (const [modelId, model] of Object.entries(provider.models)) {
        models.push({ id: modelId, name: model.name, providerID: provider.id, providerName: provider.name });
      }
    }

    const currentModel = res.data.default?.["default"] ?? null;
    return { models, currentModel };
  }

  /**
   * Reply to a question prompt.
   */
  async replyQuestion(requestId: string, answers: string[][]): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.question.reply({
      requestID: requestId,
      answers,
    });
  }

  /**
   * Reject a question prompt.
   */
  async rejectQuestion(requestId: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.question.reject({
      requestID: requestId,
    });
  }

  // ── Settings: Provider management ──

  async listProviderConnections(): Promise<{ providers: ProviderInfo[]; connected: string[] }> {
    if (!this.client) throw new Error("No workspace active");
    const res = await this.client.provider.list();
    if (!res.data) throw new Error("Failed to list providers");

    // Fetch auth methods for all providers
    const authRes = await this.client.provider.auth();
    const authMap: Record<string, any[]> = (authRes.data as any) ?? {};

    const connected = res.data.connected ?? [];
    const providers: ProviderInfo[] = res.data.all.map((p: any) => {
      const authMethods = authMap[p.id] ?? [];
      return {
        id: p.id,
        name: p.name,
        connected: connected.includes(p.id),
        models: Object.entries(p.models || {}).map(([id, m]: [string, any]) => ({
          id,
          name: m.name,
        })),
        authMethods: authMethods.length > 0 ? authMethods : WorkspaceManager.defaultApiAuthMethods(),
      };
    });

    return { providers, connected };
  }

  private static defaultApiAuthMethods(): ProviderAuthMethod[] {
    return [{ type: "api", label: "API Key" }];
  }

  async setProviderAuth(providerID: string, auth: ProviderAuthData): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.auth.set({ providerID, auth: auth as any });
  }

  async startProviderOAuth(providerID: string, methodIndex: number, inputs?: Record<string, string>): Promise<ProviderOAuthStart> {
    if (!this.client) throw new Error("No workspace active");
    const res = await this.client.provider.oauth.authorize({
      providerID,
      method: methodIndex,
      inputs,
    });
    if (!res.data) throw new Error("Failed to start OAuth");
    return {
      url: res.data.url,
      method: res.data.method,
      instructions: res.data.instructions,
    };
  }

  async completeProviderOAuth(providerID: string, methodIndex: number, code?: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    const params: { providerID: string; method: number; code?: string } = {
      providerID,
      method: methodIndex,
    };
    if (code) params.code = code;
    const res = await this.client.provider.oauth.callback(params);
    if (res.data !== true) throw new Error("OAuth callback failed");
  }

  async removeProviderAuth(providerID: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.auth.remove({ providerID });
  }

  // ── Settings: MCP management ──

  async listMcpServers(): Promise<McpServerInfo[]> {
    if (!this.client) throw new Error("No workspace active");
    const statusRes = await this.client.mcp.status();
    if (!statusRes.data) return [];

    // Get config to retrieve server configs
    const configRes = await this.client.config.get();
    const mcpConfig = configRes.data?.mcp ?? {};

    const servers: McpServerInfo[] = [];
    for (const [name, status] of Object.entries(statusRes.data as Record<string, any>)) {
      const cfg = (mcpConfig as any)[name];
      servers.push({
        name,
        status: status.status,
        error: status.error,
        config: cfg && typeof cfg === "object" && "type" in cfg ? cfg : undefined,
      });
    }
    return servers;
  }

  async addMcpServer(name: string, config: McpLocalConfig | McpRemoteConfig): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.mcp.add({ name, config: config as any });
  }

  async removeMcpServer(name: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    // Disconnect first, then disable via config
    try { await this.client.mcp.disconnect({ name }); } catch {}
    const configRes = await this.client.config.get();
    const mcp = { ...(configRes.data?.mcp as any ?? {}) };
    delete mcp[name];
    await this.client.config.update({ config: { mcp } as any });
  }

  async reconnectMcpServer(name: string): Promise<void> {
    if (!this.client) throw new Error("No workspace active");
    await this.client.mcp.connect({ name });
  }

  /**
   * Map raw SDK parts to our MessagePart type.
   */
  static mapParts(parts: any[]): MessagePart[] {
    const result: MessagePart[] = [];
    for (const p of parts) {
      switch (p.type) {
        case "text":
          result.push({ id: p.id, type: "text", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
          break;
        case "reasoning":
          result.push({ id: p.id, type: "reasoning", sessionID: p.sessionID, messageID: p.messageID, text: p.text ?? "" });
          break;
        case "tool":
          result.push({ id: p.id, type: "tool", sessionID: p.sessionID, messageID: p.messageID, tool: p.tool, state: p.state });
          break;
        case "step-start":
          result.push({ id: p.id, type: "step-start", sessionID: p.sessionID, messageID: p.messageID });
          break;
        case "step-finish":
          result.push({ id: p.id, type: "step-finish", sessionID: p.sessionID, messageID: p.messageID, tokens: p.tokens });
          break;
      }
    }
    return result;
  }
}
