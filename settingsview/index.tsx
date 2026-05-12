import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rpc, onSettingsEvent } from "./rpc";
import App from "./App";
import { ThemeProvider } from "../components/ThemeProvider";
import type { Theme } from "../shared/types";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      sync={{
        getTheme: async () => {
          const res = await rpc.request.getTheme({});
          return res.theme;
        },
        setTheme: async (theme: Theme) => {
          await rpc.request.setTheme({ theme });
        },
        subscribe: (callback) => onSettingsEvent("themeChanged", (payload: { theme: Theme }) => callback(payload.theme)),
      }}
    >
      <App />
    </ThemeProvider>
  </StrictMode>,
);
