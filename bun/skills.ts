import { join } from "node:path";
import { mkdir, stat, rm, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const TARBALL_URL = "https://github.com/anthropics/skills/archive/refs/heads/main.tar.gz";
const SKILL_NAMES = ["docx", "pdf", "pptx", "xlsx"];

/**
 * Installs agent skills from the anthropics/skills repository into the workspace.
 */
export class SkillInstaller {
  /**
   * Install missing skills into `.agents/skills/` in the given workspace.
   * Skips skills that already exist.
   */
  static async install(workspacePath: string): Promise<void> {
    const skillsDir = join(workspacePath, ".agents", "skills");
    await mkdir(skillsDir, { recursive: true });

    const toInstall: string[] = [];
    for (const name of SKILL_NAMES) {
      if (!(await SkillInstaller.exists(join(skillsDir, name)))) {
        toInstall.push(name);
      }
    }

    if (toInstall.length === 0) return;

    const tmpDir = join(tmpdir(), `krow-skills-${randomUUID()}`);
    try {
      await mkdir(tmpDir, { recursive: true });

      const tarPath = join(tmpDir, "skills.tar.gz");
      const res = await fetch(TARBALL_URL);
      if (!res.ok) {
        throw new Error(`Failed to download skills tarball: ${res.status}`);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      await writeFile(tarPath, buffer as any);

      const extractPatterns = toInstall
        .map((name) => `"skills-main/skills/${name}"`)
        .join(" ");

      execSync(`tar -xzf "${tarPath}" -C "${tmpDir}" ${extractPatterns}`, {
        stdio: "pipe",
        timeout: 30000,
      });

      for (const name of toInstall) {
        const src = join(tmpDir, "skills-main", "skills", name);
        const dest = join(skillsDir, name);
        if (await SkillInstaller.exists(src)) {
          execSync(`cp -r "${src}" "${dest}"`, { stdio: "pipe" });
        }
      }
    } finally {
      try {
        await rm(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private static async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
