import { BrowserView } from "electrobun/bun";
import type { KrowRPCSchema } from "../shared/types";
import { WorkspaceManager } from "./workspace";
import { ensureOpencode } from "./opencode-installer";

/**
 * Creates the RPC handler that bridges the webview and bun process.
 */
export function createRpcHandler(workspace: WorkspaceManager, desktopPath: string, onOpenSettings: () => void) {
  let initPromise: Promise<{ path: string } | { error: string }> | null = null;

  const rpc = BrowserView.defineRPC<KrowRPCSchema>({
    maxRequestTime: 120000,
    handlers: {
      requests: {
        initWorkspace: async () => {
          if (!initPromise) {
            initPromise = (async () => {
              try {
                await ensureOpencode((message) => {
                  rpc.send.downloadProgress({ message });
                });
                await workspace.start(desktopPath);
                workspace.startEventStream(rpc.send);
                return { path: desktopPath };
              } catch (err: any) {
                initPromise = null;
                return { error: err?.message ?? String(err) };
              }
            })();
          }
          return initPromise;
        },

        createSession: async () => {
          try {
            const sessionId = await workspace.getOrCreateSession();
            const history = await workspace.getSessionHistory(sessionId);
            return { sessionId, history };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        newSession: async () => {
          try {
            const sessionId = await workspace.createNewSession();
            return { sessionId };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        listSessions: async () => {
          try {
            const sessions = await workspace.listSessions();
            return { sessions };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        loadSession: async ({ sessionId }) => {
          try {
            const history = await workspace.getSessionHistory(sessionId);
            return { sessionId, history };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        sendMessage: async ({ sessionId, text, model }) => {
          try {
            await workspace.sendMessage(sessionId, text, model);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        getProviders: async () => {
          try {
            return await workspace.getProviders();
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        openSettings: async () => {
          onOpenSettings();
          return { success: true };
        },

        replyQuestion: async ({ requestId, answers }) => {
          try {
            await workspace.replyQuestion(requestId, answers);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        rejectQuestion: async ({ requestId }) => {
          try {
            await workspace.rejectQuestion(requestId);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        // Settings: Providers
        listProviderConnections: async () => {
          try {
            return await workspace.listProviderConnections();
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        setProviderAuth: async ({ providerID, auth }) => {
          try {
            await workspace.setProviderAuth(providerID, auth);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        startProviderOAuth: async ({ providerID, methodIndex, inputs }) => {
          try {
            return await workspace.startProviderOAuth(providerID, methodIndex, inputs);
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        completeProviderOAuth: async ({ providerID, methodIndex, code }) => {
          try {
            await workspace.completeProviderOAuth(providerID, methodIndex, code);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        removeProviderAuth: async ({ providerID }) => {
          try {
            await workspace.removeProviderAuth(providerID);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        // Settings: MCP
        listMcpServers: async () => {
          try {
            const servers = await workspace.listMcpServers();
            return { servers };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        addMcpServer: async ({ name, config }) => {
          try {
            await workspace.addMcpServer(name, config);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        removeMcpServer: async ({ name }) => {
          try {
            await workspace.removeMcpServer(name);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        reconnectMcpServer: async ({ name }) => {
          try {
            await workspace.reconnectMcpServer(name);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },
      },
      messages: {},
    },
  });

  return rpc;
}
