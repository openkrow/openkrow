import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

/**
 * OpenKrow configuration schema.
 */
export interface OpenKrowConfig {
  /** LLM provider */
  provider: "openai" | "anthropic" | "google";
  /** Model identifier */
  model: string;
  /** API key (prefer env vars over config file) */
  apiKey?: string;
  /** Custom base URL for the LLM API */
  baseUrl?: string;
  /** Maximum tokens per response */
  maxTokens: number;
  /** Temperature for generation */
  temperature: number;
  /** Maximum agent turns per prompt */
  maxTurns: number;
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Workspace directory path (optional — enables workspace features) */
  workspacePath?: string;
}

const DEFAULT_CONFIG: OpenKrowConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  maxTokens: 4096,
  temperature: 0,
  maxTurns: 20,
};

/**
 * Resolve the config file path.
 * Looks at $OPENKROW_CONFIG, then ~/.config/openkrow/config.json
 */
export function getConfigPath(): string {
  if (process.env.OPENKROW_CONFIG) {
    return process.env.OPENKROW_CONFIG;
  }
  return path.join(os.homedir(), ".config", "openkrow", "config.json");
}

/**
 * Load config from disk, merging with defaults and env vars.
 * Missing file is not an error -- defaults are used.
 */
export async function loadConfig(
  overrides?: Partial<OpenKrowConfig>
): Promise<OpenKrowConfig> {
  let fileConfig: Partial<OpenKrowConfig> = {};

  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    fileConfig = JSON.parse(raw) as Partial<OpenKrowConfig>;
  } catch {
    // Config file doesn't exist yet -- that's fine
  }

  // Env vars take precedence over file config
  const envConfig: Partial<OpenKrowConfig> = {};
  if (process.env.OPENKROW_PROVIDER) {
    envConfig.provider = process.env.OPENKROW_PROVIDER as OpenKrowConfig["provider"];
  }
  if (process.env.OPENKROW_MODEL) {
    envConfig.model = process.env.OPENKROW_MODEL;
  }
  if (process.env.OPENKROW_API_KEY) {
    envConfig.apiKey = process.env.OPENKROW_API_KEY;
  }
  if (process.env.OPENKROW_WORKSPACE) {
    envConfig.workspacePath = process.env.OPENKROW_WORKSPACE;
  }

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    ...envConfig,
    ...overrides,
  };
}

/**
 * Write config to disk.
 */
export async function saveConfig(config: OpenKrowConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  // Strip apiKey from persisted config -- should live in env vars
  const { apiKey: _, ...safeConfig } = config;
  await fs.writeFile(configPath, JSON.stringify(safeConfig, null, 2) + "\n", "utf-8");
}

/**
 * Reset config to defaults.
 */
export async function resetConfig(): Promise<void> {
  await saveConfig(DEFAULT_CONFIG);
}
