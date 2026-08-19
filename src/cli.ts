#!/usr/bin/env node
import { Command } from "commander";
import { initProject } from "./commands/init.js";
import { installAll } from "./commands/install.js";
import { installMcp } from "./commands/mcp.js";
import { installClaudeSkills } from "./commands/skills.js";
import { startMcpServer } from "./mcp/server.js";

const program = new Command();
program.name("cmdr").description("CLI-first browser agent with MCP and skills").version("0.1.0");

program.command("init [directory]").description("Create Cmdr profile configuration and install bundled skills").action(async (directory?: string) => initProject(directory));
program.command("mcp").description("Run the Cmdr browser MCP server over stdio").action(async () => startMcpServer());

program
  .command("install [directory]")
  .description("Install skills (primary) and optionally wire MCP (supplementary)")
  .option("--global", "Install skills to ~/.claude/skills + ~/.codex/skills (default)")
  .option("--project", "Install skills to ./.claude/skills + ./.codex/skills")
  .option("--with-mcp", "Also wire MCP entry (npx cmdr-browser mcp) for Claude/Codex")
  .option("--mcp-only", "Only wire MCP, skip skills")
  .option("--mcp-scope <scope>", "MCP scope: claude|codex|all (default: all)", "all")
  .action(
    async (directory: string | undefined, opts: { global?: boolean; project?: boolean; withMcp?: boolean; mcpOnly?: boolean; mcpScope: string }) => {
      const parseMcp = (v: string) => (v === "claude" ? (["claude"] as const) : v === "codex" ? (["codex"] as const) : (["claude", "codex"] as const));
      if (opts.mcpOnly) {
        await installMcp({ scopes: [...parseMcp(opts.mcpScope)], project: Boolean(opts.project), directory });
        return;
      }
      await installAll({ scope: opts.project ? "project" : "global", directory, withMcp: Boolean(opts.withMcp), mcpScopes: [...parseMcp(opts.mcpScope)] });
    },
  );

const skills = program.command("skills").description("Manage bundled Agent Skills");
skills
  .command("install")
  .description("Install bundled skills to Claude/Codex (so /ab-testing works)")
  .option("--global", "Install to ~/.claude/skills + ~/.codex/skills (default)")
  .option("--project", "Also install to ./.claude/skills + ./.codex/skills")
  .option("--dir <path>", "Project directory for --project")
  .option("--with-mcp", "Also wire MCP")
  .action(async (opts: { global?: boolean; project?: boolean; dir?: string; withMcp?: boolean }) => {
    const doProject = Boolean(opts.project);
    await installClaudeSkills({ global: opts.global ?? !doProject, project: doProject, directory: opts.dir });
    if (opts.withMcp) await installMcp({ scopes: ["claude", "codex"], project: doProject, directory: opts.dir });
  });

program
  .command("mcp:install [directory]")
  .description("Wire MCP entry for Claude / Codex")
  .option("--scope <scope>", "claude|codex|all (default: all)", "all")
  .action(async (directory: string | undefined, opts: { scope: string }) => {
    const parseMcp = (v: string) => (v === "claude" ? (["claude"] as const) : v === "codex" ? (["codex"] as const) : (["claude", "codex"] as const));
    await installMcp({ scopes: [...parseMcp(opts.scope)], directory, project: Boolean(directory) });
  });

await program.parseAsync();
