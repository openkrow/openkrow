import { loadConfig, getConfigPath, resetConfig } from "../config/loader.js";

interface ConfigOpts {
  path?: boolean;
  reset?: boolean;
}

export async function configCommand(opts: ConfigOpts): Promise<void> {
  if (opts.path) {
    console.log(getConfigPath());
    return;
  }

  if (opts.reset) {
    await resetConfig();
    console.log("Configuration reset to defaults.");
    console.log(`Config file: ${getConfigPath()}`);
    return;
  }

  // Default: show current config
  const config = await loadConfig();
  console.log(`
OpenKrow Configuration
──────────────────────
Config file:  ${getConfigPath()}

Provider:     ${config.provider}
Model:        ${config.model}
Max tokens:   ${config.maxTokens}
Temperature:  ${config.temperature}
Tools:        ${config.enableTools ? "enabled" : "disabled"}
Streaming:    ${config.enableStreaming ? "enabled" : "disabled"}
Max turns:    ${config.maxTurns}
System:       ${config.systemPrompt ? "(custom)" : "(default)"}
  `);
}
