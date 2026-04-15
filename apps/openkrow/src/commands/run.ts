import { OpenKrow } from "../openkrow.js";

interface RunOpts {
  model?: string;
  provider?: string;
  tools?: boolean;
}

export async function runCommand(
  prompt: string,
  opts: RunOpts
): Promise<void> {
  const krow = await OpenKrow.create({
    provider: opts.provider as "openai" | "anthropic" | "google" | undefined,
    model: opts.model,
    enableTools: opts.tools !== false,
  });

  try {
    const response = await krow.run(prompt);
    process.stdout.write(response + "\n");
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}
