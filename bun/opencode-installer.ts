/**
 * Runtime installer for the opencode CLI binary.
 * Downloads opencode on first launch if not already installed.
 * Installs to ~/.opencode/bin/opencode (persists across app updates).
 */

import { existsSync, mkdirSync, chmodSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const REPO = "opencode-ai/opencode";
const INSTALL_DIR = join(homedir(), ".opencode", "bin");
const BINARY_PATH = join(INSTALL_DIR, "opencode");

export type ProgressCallback = (message: string) => void;

function getPlatformAsset(): string | null {
  const platform = process.platform === "darwin" ? "mac" : process.platform === "linux" ? "linux" : null;
  if (!platform) return null;
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  return `opencode-${platform}-${arch}.tar.gz`;
}

function isOpencodeOnPath(): boolean {
  try {
    const result = spawnSync("opencode", ["-v"], { stdio: "pipe", timeout: 5000 });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Ensures opencode is available. Downloads if needed.
 * Returns true if opencode is ready, false if install failed.
 */
export async function ensureOpencode(onProgress?: ProgressCallback): Promise<void> {
  // Check if already installed (bundled or system)
  if (existsSync(BINARY_PATH) || isOpencodeOnPath()) {
    return;
  }

  const asset = getPlatformAsset();
  if (!asset) {
    throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`);
  }

  onProgress?.("Downloading opencode...");

  mkdirSync(INSTALL_DIR, { recursive: true });

  const url = `https://github.com/${REPO}/releases/latest/download/${asset}`;
  const tmpDir = join(tmpdir(), `krow-opencode-${randomUUID()}`);

  try {
    mkdirSync(tmpDir, { recursive: true });
    const tarPath = join(tmpDir, asset);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    await writeFile(tarPath, Buffer.from(await res.arrayBuffer()) as any);
    execFileSync("tar", ["xzf", tarPath, "-C", INSTALL_DIR], { stdio: "pipe", timeout: 120000 });
    chmodSync(BINARY_PATH, 0o755);
    onProgress?.("opencode installed successfully");
  } catch (err: any) {
    throw new Error(`Failed to download opencode: ${err?.message ?? String(err)}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
