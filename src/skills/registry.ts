import { access, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export type Skill = {
  name: string;
  description: string;
  path: string;
  instructions: string;
};

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packageSkillsRoots = [
  resolve(moduleDirectory, "../../skills"),
  resolve(moduleDirectory, "../../../skills"),
];

export async function resolveBundledSkillsDirectory(): Promise<
  string | undefined
> {
  for (const candidate of packageSkillsRoots) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function discoverSkills(root?: string): Promise<Skill[]> {
  const skills: Skill[] = [];
  const skillsRoot = root
    ? resolve(root)
    : await resolveBundledSkillsDirectory();
  if (!skillsRoot) return skills;
  if (root) {
    try {
      await access(skillsRoot);
    } catch {
      return skills;
    }
  }

  const pending = [skillsRoot];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) pending.push(resolve(directory, entry.name));
    }

    const path = resolve(directory, "SKILL.md");
    try {
      const instructions = await readFile(path, "utf8");
      const frontmatter = instructions.match(
        /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/,
      )?.[1];
      if (!frontmatter) continue;
      const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim();
      const description = frontmatter
        .match(/^description:\s*(.+)$/m)?.[1]
        ?.trim();
      if (!name || !description) continue;
      skills.push({ name, description, path, instructions });
    } catch {
      continue;
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}
