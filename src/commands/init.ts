import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveBundledSkillsDirectory } from "../skills/registry.js";

export async function initProject(directory = "."): Promise<void> {
  const root = resolve(directory);
  const bundledSkillsDirectory = await resolveBundledSkillsDirectory();
  if (!bundledSkillsDirectory) {
    throw new Error("Bundled skills directory is not available");
  }
  await mkdir(resolve(root, ".cmdr"), { recursive: true });
  await cp(bundledSkillsDirectory, resolve(root, "skills"), {
    recursive: true,
    force: false,
  });
  await writeFile(
    resolve(root, ".cmdr", "config.json"),
    `${JSON.stringify({ browser: { headless: false, profileDir: ".cmdr/profiles/default" } }, null, 2)}\n`,
    "utf8",
  );
  console.error(`Cmdr initialized in ${root}`);
}
