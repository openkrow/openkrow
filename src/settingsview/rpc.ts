import { Electroview } from "electrobun/view";
import type { SettingsRPCSchema } from "../shared/types";

export const rpc = Electroview.defineRPC<SettingsRPCSchema>({
  maxRequestTime: 120000,
  handlers: {
    requests: {},
    messages: {},
  },
});

export const electrobun = new Electroview({ rpc });
