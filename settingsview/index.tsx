import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./rpc";
import App from "./App";
import { ThemeProvider } from "../components/ThemeProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
