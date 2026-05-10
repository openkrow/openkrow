import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./rpc";
import App from "./App";

// Mount React app
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
