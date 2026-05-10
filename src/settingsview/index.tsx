import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./rpc";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
