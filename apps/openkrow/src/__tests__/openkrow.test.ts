import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { OpenKrow } from "../openkrow.js";

describe("OpenKrow", () => {
  it("should create an instance with default config", async () => {
    const krow = await OpenKrow.create();
    const config = krow.getConfig();

    assert.equal(config.provider, "anthropic");
    assert.equal(config.enableTools, true);
    assert.ok(krow.getAgent());
  });

  it("should create an instance with custom overrides", async () => {
    // OpenAI SDK requires an API key at construction time, even if unused.
    const orig = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-for-ci";
    try {
      const krow = await OpenKrow.create({
        provider: "openai",
        model: "gpt-4o",
        enableTools: false,
      });

      const config = krow.getConfig();
      assert.equal(config.provider, "openai");
      assert.equal(config.model, "gpt-4o");
      assert.equal(config.enableTools, false);
    } finally {
      if (orig === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = orig;
    }
  });

  it("should register tools when enableTools is true", async () => {
    const krow = await OpenKrow.create({ enableTools: true });
    const tools = krow.getAgent().tools.list();

    assert.ok(tools.length > 0);
    assert.ok(tools.includes("read_file"));
    assert.ok(tools.includes("write_file"));
    assert.ok(tools.includes("edit_file"));
    assert.ok(tools.includes("bash"));
    assert.ok(tools.includes("grep"));
    assert.ok(tools.includes("list_files"));
  });

  it("should not register tools when enableTools is false", async () => {
    const krow = await OpenKrow.create({ enableTools: false });
    const tools = krow.getAgent().tools.list();

    assert.equal(tools.length, 0);
  });
});
