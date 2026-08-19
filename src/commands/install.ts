import { resolve } from "node:path";
import { installMcp, type McpScope } from "./mcp.js";
import { installClaudeSkills } from "./skills.js";

export type InstallAllOptions = {
  scope?: "global" | "project";
  directory?: string;
  withMcp?: boolean;
  mcpScopes?: McpScope[];
};

export async function installAll(options: InstallAllOptions = {}): Promise<void> {
  const isProject = options.scope === "project";
  const directory = options.directory ? resolve(options.directory) : isProject ? resolve(".") : undefined;
  await installClaudeSkills({ global: !isProject, project: isProject, directory });
  if (options.withMcp) await installMcp({ scopes: options.mcpScopes ?? ["claude", "codex"], project: isProject, directory });
  console.error("");
  if (options.withMcp) console.error("Done. Restart Claude / Codex, then try /ab-testing and browser_start (Cmdr's isolated profile).");
  else {
    console.error("Done. Restart Claude / Codex, then try /ab-testing.");
    console.error("Tip: add --with-mcp to also wire the browser MCP (npx cmdr-browser mcp).");
  }
}
