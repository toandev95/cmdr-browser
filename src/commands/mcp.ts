import { homedir } from "node:os";
import { resolve } from "node:path";

export type McpScope = "claude" | "codex";
export type McpInstallOptions = {
  scopes?: McpScope[];
  project?: boolean;
  directory?: string;
};

function claudeConfigPaths(): string[] {
  if (process.platform === "darwin")
    return [
      resolve(
        homedir(),
        "Library/Application Support/Claude/claude_desktop_config.json",
      ),
      resolve(
        homedir(),
        "Library/Application Support/Claude-3p/claude_desktop_config.json",
      ),
    ];
  if (process.platform === "win32") {
    const base = process.env.APPDATA ?? resolve(homedir(), "AppData/Roaming");
    return [
      resolve(base, "Claude/claude_desktop_config.json"),
      resolve(base, "Claude-3p/claude_desktop_config.json"),
    ];
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? resolve(homedir(), ".config");
  return [
    resolve(xdg, "Claude/claude_desktop_config.json"),
    resolve(xdg, "Claude-3p/claude_desktop_config.json"),
  ];
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writeJson(
  path: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function installMcp(
  options: McpInstallOptions = {},
): Promise<{ written: string[] }> {
  const scopes = options.scopes ?? ["claude", "codex"];
  const written: string[] = [];
  if (scopes.includes("claude")) {
    for (const path of claudeConfigPaths()) {
      const config = await readJson(path);
      const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
      servers["cmdr-browser"] = {
        command: "npx",
        args: ["--yes", "github:toandev95/cmdr-browser", "mcp"],
      };
      config.mcpServers = servers;
      await writeJson(path, config);
      written.push(path);
      console.error(`MCP (Claude) -> ${path}`);
    }
    if (options.project) {
      const dir = options.directory ?? resolve(".");
      const projectPath = resolve(dir, ".mcp.json");
      const pConfig = await readJson(projectPath);
      const pServers = (pConfig.mcpServers ?? {}) as Record<string, unknown>;
      pServers["cmdr-browser"] = {
        command: "npx",
        args: ["--yes", "github:toandev95/cmdr-browser", "mcp"],
      };
      pConfig.mcpServers = pServers;
      await writeJson(projectPath, pConfig);
      if (!written.includes(projectPath)) written.push(projectPath);
      console.error(`MCP (Claude project) -> ${projectPath}`);
    }
  }
  if (scopes.includes("codex")) {
    const path = resolve(homedir(), ".codex", "config.toml");
    const { readFile, writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(resolve(homedir(), ".codex"), { recursive: true });
    let content = "";
    try {
      content = await readFile(path, "utf8");
    } catch {
      content = "";
    }
    const entry = `[mcp_servers.cmdr-browser]\ncommand = "npx"\nargs = ["--yes", "github:toandev95/cmdr-browser", "mcp"]\n`;
    if (content.includes("[mcp_servers.cmdr-browser]")) {
      const header = "[mcp_servers.cmdr-browser]";
      const start = content.indexOf(header);
      const after = content.slice(start + header.length);
      const next = after.search(/\n\[/);
      if (next === -1) content = content.slice(0, start) + entry;
      else content = content.slice(0, start) + entry + after.slice(next + 1);
    } else {
      if (content && !content.endsWith("\n")) content += "\n";
      content += entry;
    }
    await writeFile(path, content, "utf8");
    written.push(path);
    console.error(`MCP (Codex) -> ${path}`);
  }
  return { written };
}
