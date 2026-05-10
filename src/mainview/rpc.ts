import { Electroview } from "electrobun/view";
import type { KrowRPCSchema } from "../shared/types";

type EventCallback = (data: any) => void;
const listeners = new Map<string, Set<EventCallback>>();

export function onStreamEvent(type: string, callback: EventCallback) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(callback);
  return () => { listeners.get(type)?.delete(callback); };
}

function emit(type: string, data: any) {
  listeners.get(type)?.forEach((cb) => cb(data));
}

// Initialize Electrobun RPC for the webview side
export const rpc = Electroview.defineRPC<KrowRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {},
    messages: {
      workspaceReady: (payload) => {
        emit("workspaceReady", payload);
      },
      workspaceError: (payload) => {
        emit("workspaceError", payload);
      },
      partUpdated: (payload) => {
        emit("partUpdated", payload);
      },
      messageComplete: (payload) => {
        emit("messageComplete", payload);
      },
      sessionStatus: (payload) => {
        emit("sessionStatus", payload);
      },
      sessionError: (payload) => {
        emit("sessionError", payload);
      },
      questionAsked: (payload) => {
        emit("questionAsked", payload);
      },
      settingsChanged: (payload) => {
        emit("settingsChanged", payload);
      },
    },
  },
});

export const electrobun = new Electroview({ rpc });
