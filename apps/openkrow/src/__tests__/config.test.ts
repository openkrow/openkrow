import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { loadConfig } from "../config/loader.js";
import { VERSION } from "../version.js";

describe("OpenKrow App", () => {
  describe("VERSION", () => {
    it("should be a valid semver string", () => {
      assert.match(VERSION, /^\d+\.\d+\.\d+$/);
    });
  });

  describe("loadConfig", () => {
    it("should return default config when no file or env vars exist", async () => {
      const config = await loadConfig();

      assert.equal(config.provider, "anthropic");
      assert.equal(config.model, "claude-sonnet-4-20250514");
      assert.equal(config.maxTokens, 4096);
      assert.equal(config.temperature, 0);
      assert.equal(config.maxTurns, 20);
    });

    it("should apply overrides on top of defaults", async () => {
      const config = await loadConfig({
        provider: "openai",
        model: "gpt-4o",
        maxTokens: 8192,
      });

      assert.equal(config.provider, "openai");
      assert.equal(config.model, "gpt-4o");
      assert.equal(config.maxTokens, 8192);
      assert.equal(config.temperature, 0);
    });

    it("should respect env var overrides", async () => {
      const origProvider = process.env.OPENKROW_PROVIDER;
      const origModel = process.env.OPENKROW_MODEL;

      try {
        process.env.OPENKROW_PROVIDER = "google";
        process.env.OPENKROW_MODEL = "gemini-2.0-flash";

        const config = await loadConfig();
        assert.equal(config.provider, "google");
        assert.equal(config.model, "gemini-2.0-flash");
      } finally {
        if (origProvider === undefined) delete process.env.OPENKROW_PROVIDER;
        else process.env.OPENKROW_PROVIDER = origProvider;
        if (origModel === undefined) delete process.env.OPENKROW_MODEL;
        else process.env.OPENKROW_MODEL = origModel;
      }
    });

    it("should let explicit overrides win over env vars", async () => {
      const origProvider = process.env.OPENKROW_PROVIDER;

      try {
        process.env.OPENKROW_PROVIDER = "google";

        const config = await loadConfig({ provider: "openai" });
        assert.equal(config.provider, "openai");
      } finally {
        if (origProvider === undefined) delete process.env.OPENKROW_PROVIDER;
        else process.env.OPENKROW_PROVIDER = origProvider;
      }
    });
  });
});
