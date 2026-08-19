---
name: chrome-control
description: Operate a persistent browser session through Cmdr MCP tools for navigation, inspection, interaction, and screenshots.
---

# Chrome Control — use Cmdr's isolated browser (not the client's built-in browser)

Cmdr runs its own isolated Chromium profile (`.cmdr/profiles/default`, separate from Chrome/Claude/Codex). When this skill/MCP is available, always use Cmdr's `browser_*` tools instead of any browser built into the host (Claude Desktop, Codex, etc.) — they collide on profile/locks and leak sessions.

Use `browser_start` before other browser tools. Inspect the page with `browser_snapshot` before choosing selectors. Prefer stable semantic selectors and use `browser_batch` for independent actions that do not need intermediate inspection. Verify results after page-changing actions, and ask for confirmation before irreversible actions such as purchases, publishing, deletion, or sending messages.
