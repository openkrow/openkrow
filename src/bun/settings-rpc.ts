import { BrowserView } from "electrobun/bun";
import type { SettingsRPCSchema } from "../shared/types";
import { WorkspaceManager } from "./workspace";

/**
 * Creates the RPC handler for the Settings window.
 * onSettingsChanged is called after any mutation to notify the main window.
 */
export function createSettingsRpcHandler(workspace: WorkspaceManager, onSettingsChanged: () => void) {
  return BrowserView.defineRPC<SettingsRPCSchema>({
    maxRequestTime: 120000,
    handlers: {
      requests: {
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
            onSettingsChanged();
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
            onSettingsChanged();
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        removeProviderAuth: async ({ providerID }) => {
          try {
            await workspace.removeProviderAuth(providerID);
            onSettingsChanged();
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

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
            onSettingsChanged();
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        removeMcpServer: async ({ name }) => {
          try {
            await workspace.removeMcpServer(name);
            onSettingsChanged();
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },

        reconnectMcpServer: async ({ name }) => {
          try {
            await workspace.reconnectMcpServer(name);
            onSettingsChanged();
            return { success: true };
          } catch (err: any) {
            return { error: err?.message ?? String(err) };
          }
        },
      },
      messages: {},
    },
  });
}
