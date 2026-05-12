import { Electroview } from "electrobun/view";
import type { SettingsRPCSchema } from "../shared/types";

type EventCallback = (data: any) => void;
const listeners = new Map<string, Set<EventCallback>>();

export function onSettingsEvent(type: string, callback: EventCallback) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(callback);
  return () => { listeners.get(type)?.delete(callback); };
}

function emit(type: string, data: any) {
  listeners.get(type)?.forEach((cb) => cb(data));
}

export const rpc = Electroview.defineRPC<SettingsRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {},
    messages: {
      themeChanged: (payload) => {
        emit("themeChanged", payload);
      },
    },
  },
});

export const electrobun = new Electroview({ rpc });
