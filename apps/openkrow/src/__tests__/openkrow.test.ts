import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { OpenKrow } from "../openkrow.js";

describe("OpenKrow", () => {
  it("should create an instance with default config", async () => {
    const krow = await OpenKrow.create();
    const config = krow.getConfig();

    assert.equal(config.provider, "anthropic");
    assert.ok(krow.getAgent());
  });

  it("should create an instance with custom overrides", async () => {
    const orig = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key-for-ci";
    try {
      const krow = await OpenKrow.create({
        provider: "openai",
        model: "gpt-4o",
      });

      const config = krow.getConfig();
      assert.equal(config.provider, "openai");
      assert.equal(config.model, "gpt-4o");
    } finally {
      if (orig === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = orig;
    }
  });

  it("should always register tools via ToolManager", async () => {
    const krow = await OpenKrow.create();
    const tools = krow.getAgent().tools.list();

    assert.ok(tools.length > 0);
    assert.ok(tools.includes("read_file"));
    assert.ok(tools.includes("write_file"));
    assert.ok(tools.includes("bash"));
  });
});
