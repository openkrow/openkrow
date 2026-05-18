import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

const PREFS_DIR = join(homedir(), ".openkrow");
const PREFS_FILE = join(PREFS_DIR, "preferences.json");

type Preferences = {
  lastWorkspace?: string;
};

function load(): Preferences {
  try {
    if (existsSync(PREFS_FILE)) {
      return JSON.parse(readFileSync(PREFS_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function save(prefs: Preferences): void {
  try {
    if (!existsSync(PREFS_DIR)) {
      mkdirSync(PREFS_DIR, { recursive: true });
    }
    writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error("Failed to save preferences:", err);
  }
}

export function getLastWorkspace(): string | null {
  return load().lastWorkspace ?? null;
}

export function setLastWorkspace(path: string): void {
  const prefs = load();
  prefs.lastWorkspace = path;
  save(prefs);
}
