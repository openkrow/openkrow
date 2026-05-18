import { BrowserView, Utils } from "electrobun/bun";
import type { KrowRPCSchema, Theme } from "../shared/types";
import { WorkspaceManager } from "./workspace";
import { ensureOpencode } from "./opencode-installer";
import { getLastWorkspace, setLastWorkspace } from "./preferences";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import WORKSPACE_SETUP_PROMPT from "../prompts/workspace-setup.txt";

/**
 * Creates the RPC handler that bridges the webview and bun process.
 */
export function createRpcHandler(
  workspace: WorkspaceManager,
  desktopPath: string,
  onOpenSettings: () => void,
  themeSync: { getTheme: () => Theme; setTheme: (theme: Theme) => void },
) {
  let initPromise: Promise<{ path: string } | { error: string }> | null = null;

  const rpc = BrowserView.defineRPC<KrowRPCSchema>({
    maxRequestTime: 120000,
    handlers: {
      requests: {
        getTheme: async () => {
          return { theme: themeSync.getTheme() };
        },

        setTheme: async ({ theme }) => {
          themeSync.setTheme(theme);
          return { success: true };
        },

        getLastWorkspace: async () => {
          return { path: getLastWorkspace() };
        },

        pickFolder: async () => {
          try {
            const result = await $`osascript -e 'POSIX path of (choose folder with prompt "Select workspace folder")'`.text();
            const path = result.trim().replace(/\/$/, "");
            if (!path) return { cancelled: true as const };
            return { path };
          } catch {
            return { cancelled: true as const };
          }
        },

        validateWorkspace: async ({ path }) => {
          try {
            const exists = existsSync(path);
            const hasAgentsMd = existsSync(join(path, "AGENTS.md"));
            return { path, exists, hasAgentsMd };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        setupNewWorkspace: async ({ path }) => {
          try {
            rpc.send.downloadProgress({ message: "Downloading workspace template..." });
            // Clone into temp and copy contents into existing folder
            const tmpDir = `${path}.__krow_tmp_${Date.now()}`;
            await $`git clone https://github.com/openkrow/workspace-starter.git ${tmpDir}`.quiet();
            // Remove .git from cloned repo
            const tmpGitDir = join(tmpDir, ".git");
            if (existsSync(tmpGitDir)) {
              rmSync(tmpGitDir, { recursive: true, force: true });
            }
            // Copy template contents into workspace folder
            await $`rsync -a ${tmpDir}/ ${path}/`.quiet();
            rmSync(tmpDir, { recursive: true, force: true });
            rpc.send.downloadProgress({ message: "Workspace template ready" });
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        initWorkspaceWithPath: async ({ path }) => {
          // Reset any previous init
          initPromise = null;
          initPromise = (async () => {
            try {
              await ensureOpencode((message) => {
                rpc.send.downloadProgress({ message });
              });
              await workspace.start(path);
              workspace.startEventStream(rpc.send);
              setLastWorkspace(path);
              return { path };
            } catch (err: any) {
              initPromise = null;
              return { error: err?.message ?? String(err) };
            }
          })();
          return initPromise;
        },

        sendSetupPrompt: async ({ sessionId, projectDetails }) => {
          try {
            const prompt = WORKSPACE_SETUP_PROMPT.replace("{{PROJECT_DETAILS}}", projectDetails);
            await workspace.sendMessage(sessionId, prompt);
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

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

        stopSession: async ({ sessionId }) => {
          try {
            await workspace.stopSession(sessionId);
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

        listAgents: async () => {
          return { agents: workspace.getAgents() };
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
            const result = await workspace.startProviderOAuth(providerID, methodIndex, inputs);
            return { ...result, opened: result.url ? Utils.openExternal(result.url) : false };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        openExternalUrl: async ({ url }) => {
          try {
            return { success: Utils.openExternal(url) };
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
