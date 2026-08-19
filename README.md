# Cmdr Browser

Cmdr Browser is an MCP server for Claude and Codex (macOS / Windows) that controls an isolated Chromium browser through Playwright.

It is distributed from GitHub via `npx --yes github:toandev95/cmdr-browser` and communicates over MCP stdio. It does not require a web server or a local port.

## Requirements

- Node.js 20 or newer
- Google Chrome (stable channel)
- Claude Desktop/Codex on macOS or Windows

## Install

One command to install skills (primary) and wire the browser MCP (supplementary):

```bash
# from GitHub (recommended)
npx --yes github:toandev95/cmdr-browser install --global --with-mcp
npx --yes github:toandev95/cmdr-browser install --project --with-mcp

# local dev (inside this repo)
npx --yes . install --global --with-mcp
npx --yes . install --project --with-mcp
```

Restart Claude / Codex after install, then try a slash command like `/ab-testing` and the MCP tool `browser_start`.

## Configure A Desktop Client

Add an MCP server entry to the client's JSON configuration. The exact configuration file location depends on the client and operating system. The server entry itself is portable across Claude and Codex — the installer writes it for you, including dual Claude paths (`Claude` + `Claude-3p`) and Codex `~/.codex/config.toml`.

For a global npm install:

```json
{
    "mcpServers": {
        "cmdr-browser": {
            "command": "cmdr",
            "args": ["mcp"]
        }
    }
}
```

For a zero-install configuration (GitHub source):

```json
{
    "mcpServers": {
        "cmdr-browser": {
            "command": "npx",
            "args": ["--yes", "github:toandev95/cmdr-browser", "mcp"]
        }
    }
}
```

If a desktop client cannot resolve globally installed commands, use the absolute paths to `npx` or `cmdr` on that machine. Do not copy executable paths from another computer. Restart the desktop client after changing its MCP configuration, then call `browser_start` before using other browser tools.

## Browser Profile

Cmdr launches the installed Google Chrome stable channel and creates a dedicated persistent profile at `.cmdr/profiles/default` relative to the MCP process working directory. This keeps automation cookies and local storage separate from the personal Chrome profile.

`browser_start` accepts:

- `headless`: run without a visible browser window.
- `profileDir`: use an absolute or working-directory-relative profile path.
- `cdpUrl`: attach to an existing Chromium instance through CDP.

The process must have permission to create the profile directory. Never point Cmdr at a personal default Chrome profile.

Screenshots are written under `.cmdr/artifacts` by default, and completed downloads are persisted under `.cmdr/downloads`. Relative paths use the MCP process working directory. If a desktop client starts the process from the filesystem root, Cmdr uses the user's home directory instead, such as `~/.cmdr/artifacts` and `~/.cmdr/downloads`. Parent directories are created automatically.

## MCP Tools

### Browser

- `browser_start` starts or attaches to a browser session.
- `browser_open` navigates the active page.
- `browser_snapshot` returns bounded page text and visible interactive elements.
- `browser_batch` runs up to 50 `open`, `click`, `fill`, or `press` actions sequentially.
- `browser_click` clicks the first element matching a CSS selector.
- `browser_fill` fills the first element matching a CSS selector.
- `browser_press` sends a keyboard key to the active page.
- `browser_screenshot` saves a PNG artifact.
- `browser_tabs` lists open pages.
- `browser_close` closes the managed session.

Call `browser_snapshot` before selecting a target. Snapshot `ref` values identify elements in that snapshot, while interaction tools currently accept CSS selectors. Use the returned `selector` when available or choose a stable semantic selector.

### Skills

- `list_skills` discovers valid Agent Skills.
- `read_skill` reads a skill's complete `SKILL.md` instructions.

The package includes 50 bundled skills, including `chrome-control` and the imported marketing collection under `skills/marketingskills/`. A skill is a directory containing `SKILL.md` with `name` and `description` frontmatter. Discovery is recursive, and clients can provide another skill root through the tools' `root` argument.

## CLI

```text
cmdr mcp
cmdr init [directory]
```

`mcp` is the runtime entrypoint for desktop clients. `init` creates `.cmdr/config.json` and copies the complete bundled skill pack into `skills/` in the selected directory. Existing skill files are preserved, so running `init` again does not overwrite local changes. It does not create editor configuration or modify the desktop client's settings.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The build output is written to `dist/`. Use `npm pack --dry-run` to inspect the files included in a release.

## Publishing

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm publish
```

The published package contains `dist/`, `skills/`, and this README. Runtime profiles and screenshots are created on the user's machine and are excluded from the package.

## Security

Browser automation can access logged-in sessions, downloads, local files, and any page the user permits it to open. Use a dedicated browser profile and confirm purchases, publishing, deletion, or sending messages. Keep the MCP server on stdio, do not expose it to a network, and do not store credentials or tokens in skills or published configuration.

## Attribution

The marketing skills are imported from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills). Review and preserve the upstream project's license and attribution requirements before publishing this package.
