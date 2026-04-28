import { describe, it, expect, beforeEach } from "bun:test";
import { ConfigManager } from "../config-manager.js";
import type { ISettingsRepository } from "@openkrow/database";
import type { Setting } from "@openkrow/database";

/**
 * In-memory settings repository for testing.
 */
class InMemorySettings implements ISettingsRepository {
  private store = new Map<string, { value: string; updated_at: string }>();

  get(key: string): string | null {
    return this.store.get(key)?.value ?? null;
  }

  getJson<T>(key: string): T | null {
    const v = this.get(key);
    if (!v) return null;
    try { return JSON.parse(v) as T; } catch { return null; }
  }

  set(key: string, value: string): void {
    this.store.set(key, { value, updated_at: new Date().toISOString() });
  }

  setJson<T>(key: string, value: T): void {
    this.set(key, JSON.stringify(value));
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  getAll(): Setting[] {
    const results: Setting[] = [];
    for (const [key, { value, updated_at }] of this.store) {
      results.push({ key, value, updated_at });
    }
    return results;
  }

  getAllAsObject(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (const [key, { value }] of this.store) {
      obj[key] = value;
    }
    return obj;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

describe("ConfigManager", () => {
  let settings: InMemorySettings;
  let config: ConfigManager;

  beforeEach(() => {
    settings = new InMemorySettings();
    config = new ConfigManager(settings);
  });

  // ---- Active model ----

  describe("active model", () => {
    it("returns defaults when nothing is set", () => {
      const model = config.getActiveModel();
      expect(model.provider).toBe("anthropic");
      expect(model.model).toBe("claude-sonnet-4-20250514");
    });

    it("persists and retrieves active model", () => {
      config.setActiveModel({ provider: "openai", model: "gpt-4o" });
      const model = config.getActiveModel();
      expect(model.provider).toBe("openai");
      expect(model.model).toBe("gpt-4o");
    });

    it("getActiveModelInfo returns Model object for known models", () => {
      config.setActiveModel({ provider: "anthropic", model: "claude-sonnet-4-20250514" });
      const info = config.getActiveModelInfo();
      expect(info).toBeDefined();
      expect(info!.name).toContain("Claude");
    });

    it("getActiveModelInfo returns undefined for unknown model", () => {
      config.setActiveModel({ provider: "openai", model: "nonexistent-model" });
      const info = config.getActiveModelInfo();
      expect(info).toBeUndefined();
    });
  });

  // ---- Model overrides ----

  describe("model overrides", () => {
    it("returns null when no overrides set", () => {
      expect(config.getModelOverrides("anthropic", "claude-sonnet-4-20250514")).toBeNull();
    });

    it("persists and retrieves overrides", () => {
      config.setModelOverrides("anthropic", "claude-sonnet-4-20250514", {
        temperature: 0.7,
        maxTokens: 8192,
      });
      const overrides = config.getModelOverrides("anthropic", "claude-sonnet-4-20250514");
      expect(overrides).toEqual({ temperature: 0.7, maxTokens: 8192 });
    });

    it("removes overrides", () => {
      config.setModelOverrides("openai", "gpt-4o", { temperature: 0.5 });
      expect(config.removeModelOverrides("openai", "gpt-4o")).toBe(true);
      expect(config.getModelOverrides("openai", "gpt-4o")).toBeNull();
    });
  });

  // ---- API keys ----

  describe("api keys", () => {
    it("returns null when no key stored", () => {
      expect(config.getApiKey("anthropic")).toBeNull();
    });

    it("stores and retrieves API key", () => {
      config.setApiKey("anthropic", "sk-ant-1234567890abcdef");
      expect(config.getApiKey("anthropic")).toBe("sk-ant-1234567890abcdef");
    });

    it("removes API key", () => {
      config.setApiKey("openai", "sk-openai-xxx");
      expect(config.removeApiKey("openai")).toBe(true);
      expect(config.getApiKey("openai")).toBeNull();
    });

    it("lists API keys with masked values", () => {
      config.setApiKey("anthropic", "sk-ant-1234567890abcdef");
      config.setApiKey("openai", "sk-openai-abcdefghijklmnop");

      const keys = config.listApiKeys();
      expect(keys).toHaveLength(2);

      const anthKey = keys.find((k) => k.provider === "anthropic");
      expect(anthKey).toBeDefined();
      expect(anthKey!.masked).toBe("sk-a...cdef");
      expect(anthKey!.storedAt).toBeDefined();
    });

    it("masks short keys properly", () => {
      config.setApiKey("test", "short");
      const keys = config.listApiKeys();
      expect(keys[0].masked).toBe("****");
    });
  });

  // ---- OAuth credentials ----

  describe("oauth credentials", () => {
    it("returns null when no credentials stored", () => {
      expect(config.getOAuthCredentials("github-copilot")).toBeNull();
    });

    it("stores and retrieves OAuth credentials", () => {
      config.setOAuthCredentials({
        providerId: "github-copilot",
        refresh: "ghu_refresh_token",
        access: "ghu_access_token",
        expires: Date.now() + 3600_000,
        extra: { enterpriseUrl: "https://github.example.com" },
      });

      const creds = config.getOAuthCredentials("github-copilot");
      expect(creds).toBeDefined();
      expect(creds!.providerId).toBe("github-copilot");
      expect(creds!.refresh).toBe("ghu_refresh_token");
      expect(creds!.access).toBe("ghu_access_token");
      expect(creds!.extra?.enterpriseUrl).toBe("https://github.example.com");
      expect(creds!.storedAt).toBeDefined();
    });

    it("removes OAuth credentials", () => {
      config.setOAuthCredentials({
        providerId: "anthropic",
        refresh: "r",
        access: "a",
        expires: Date.now() + 1000,
      });
      expect(config.removeOAuthCredentials("anthropic")).toBe(true);
      expect(config.getOAuthCredentials("anthropic")).toBeNull();
    });

    it("lists OAuth credentials with expiry info", () => {
      const futureExpiry = Date.now() + 3600_000;
      const pastExpiry = Date.now() - 1000;

      config.setOAuthCredentials({
        providerId: "github-copilot",
        refresh: "r1",
        access: "a1",
        expires: futureExpiry,
      });
      config.setOAuthCredentials({
        providerId: "anthropic",
        refresh: "r2",
        access: "a2",
        expires: pastExpiry,
      });

      const list = config.listOAuthCredentials();
      expect(list).toHaveLength(2);

      const copilot = list.find((o) => o.providerId === "github-copilot");
      expect(copilot!.expired).toBe(false);

      const anthropic = list.find((o) => o.providerId === "anthropic");
      expect(anthropic!.expired).toBe(true);
    });
  });

  // ---- General settings ----

  describe("general settings", () => {
    it("system prompt defaults to null", () => {
      expect(config.getSystemPrompt()).toBeNull();
    });

    it("stores and retrieves system prompt", () => {
      config.setSystemPrompt("You are a helpful assistant.");
      expect(config.getSystemPrompt()).toBe("You are a helpful assistant.");
    });

    it("removes system prompt", () => {
      config.setSystemPrompt("custom");
      expect(config.removeSystemPrompt()).toBe(true);
      expect(config.getSystemPrompt()).toBeNull();
    });

    it("workspace path defaults to null", () => {
      expect(config.getWorkspacePath()).toBeNull();
    });

    it("stores and retrieves workspace path", () => {
      config.setWorkspacePath("/home/user/projects/myapp");
      expect(config.getWorkspacePath()).toBe("/home/user/projects/myapp");
    });

    it("max turns defaults to 20", () => {
      expect(config.getMaxTurns()).toBe(20);
    });

    it("stores and retrieves max turns", () => {
      config.setMaxTurns(50);
      expect(config.getMaxTurns()).toBe(50);
    });
  });

  // ---- Model registry ----

  describe("model registry", () => {
    it("lists all models", () => {
      const models = config.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it("lists providers", () => {
      const providers = config.listProviders();
      expect(providers).toContain("anthropic");
      expect(providers).toContain("openai");
    });

    it("lists models by provider", () => {
      const models = config.listModelsByProvider("anthropic");
      expect(models.length).toBeGreaterThan(0);
      for (const m of models) {
        expect(m.provider).toBe("anthropic");
      }
    });
  });

  // ---- Arbitrary settings ----

  describe("arbitrary settings", () => {
    it("get/set/delete", () => {
      config.set("custom:key", "value");
      expect(config.get("custom:key")).toBe("value");
      expect(config.delete("custom:key")).toBe(true);
      expect(config.get("custom:key")).toBeNull();
    });
  });
});
