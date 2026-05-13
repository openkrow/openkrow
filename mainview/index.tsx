import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { rpc, onStreamEvent } from "./rpc";
import App from "./App";
import { ThemeProvider } from "../components/ThemeProvider";
import type { Theme } from "../shared/types";

// Mount React app
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider
      publishInitial
      sync={{
        setTheme: async (theme: Theme) => {
          await rpc.request.setTheme({ theme });
        },
        subscribe: (callback) => onStreamEvent("themeChanged", (payload: { theme: Theme }) => callback(payload.theme)),
      }}
    >
      <App />
    </ThemeProvider>
  </StrictMode>,
);
