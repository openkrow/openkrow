/**
 * @openkrow/app - OpenKrow main entry point
 *
 * Open-source terminal AI coding assistant.
 * This is the primary package users install and run.
 *
 * @example
 * ```ts
 * import { OpenKrow } from "@openkrow/app";
 *
 * const krow = new OpenKrow({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
 * const response = await krow.run("Explain this codebase");
 * ```
 */

export { OpenKrow } from "./openkrow.js";
export { loadConfig, type OpenKrowConfig } from "./config/loader.js";
export { VERSION } from "./version.js";
