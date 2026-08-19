import { cp, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { discoverSkills } from "../skills/registry.js";

export type InstallSkillsOptions = {
  global?: boolean;
  project?: boolean;
  directory?: string;
};

export async function installClaudeSkills(options: InstallSkillsOptions = {}): Promise<{ installed: number; roots: string[] }> {
  const skills = await discoverSkills();
  if (skills.length === 0) throw new Error("No bundled skills found to install");
  const doGlobal = options.global ?? !options.project;
  const doProject = Boolean(options.project);
  const roots: string[] = [];
  if (doGlobal) {
    roots.push(resolve(homedir(), ".claude", "skills"), resolve(homedir(), ".codex", "skills"));
  }
  if (doProject) {
    const base = resolve(options.directory ?? ".");
    roots.push(resolve(base, ".claude", "skills"), resolve(base, ".codex", "skills"));
  }
  if (roots.length === 0) roots.push(resolve(homedir(), ".claude", "skills"), resolve(homedir(), ".codex", "skills"));
  for (const root of roots) await mkdir(root, { recursive: true });
  let installed = 0;
  for (const skill of skills) {
    const sourceDir = dirname(skill.path);
    for (const root of roots) {
      await mkdir(dirname(resolve(root, skill.name)), { recursive: true });
      await cp(sourceDir, resolve(root, skill.name), { recursive: true, force: true });
    }
    installed += 1;
  }
  for (const root of roots) console.error(`Installed ${installed} skills -> ${root}`);
  console.error("Restart Claude / Codex to pick up new skills.");
  return { installed, roots };
}
