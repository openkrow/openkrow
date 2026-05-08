import { BrowserView } from "electrobun/bun";
import type { KrowRPCSchema } from "../shared/types";
import { WorkspaceManager } from "./workspace";

/**
 * Creates the RPC handler that bridges the webview and bun process.
 */
export function createRpcHandler(workspace: WorkspaceManager, desktopPath: string) {
  let initPromise: Promise<{ path: string } | { error: string }> | null = null;

  const rpc = BrowserView.defineRPC<KrowRPCSchema>({
    maxRequestTime: 120000,
    handlers: {
      requests: {
        initWorkspace: async () => {
          if (!initPromise) {
            initPromise = (async () => {
              try {
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
      },
      messages: {},
    },
  });

  return rpc;
}
