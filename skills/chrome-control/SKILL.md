---
name: chrome-control
description: Operate Cmdr's isolated Chromium browser — navigation, inspection, interaction, extraction, tabs and screenshots. Use when the user wants to browse, scrape, automate or test web pages. Prefer this isolated profile over any host built-in browser.
---

# Chrome Control — Cmdr Isolated Browser

Cmdr runs its own isolated Chromium profile (`.cmdr/profiles/default`, separate from Chrome/Claude/Codex). Always use `browser_*` tools when this skill/MCP is available.

## Lifecycle

1. `browser_start` first (once per session). Check the returned `profileDir`.
2. Then `browser_open` / `browser_snapshot` / `browser_eval` / interaction tools.
3. `browser_close` when done (downloads are flushed first).

## Inspection workflow (optimizes tool calls)

- **Never guess selectors.** Call `browser_snapshot` first — it returns `text` + `elements[]` with stable `ref` and suggested `selector` (`#id`, `[name=...]`, `[aria-label=...]`).
- Prefer the suggested `selector` from the snapshot. If `selector` is undefined, build one from `ref` context via `browser_eval` or use `:has-text("...")`.
- For structured data (tables, lists, prices), use `browser_eval` with a JS expression like `() => [...document.querySelectorAll('table tr')].map(tr => [...tr.cells].map(c=>c.innerText))` instead of repeating snapshot.
- Use `browser_wait` after navigation/click that triggers async rendering before the next snapshot.

## Batching (minimize round-trips)

Independent actions that don't need intermediate inspection → `browser_batch` in one call:
`open | click | fill | press | select | hover | wait | eval` (up to 50).

Example: fill a form then submit:
`browser_batch` with `fill #email`, `fill [name="password"]`, `click button:has-text("Sign in")`.

Page-changing actions → verify after with `browser_snapshot` or `browser_eval`.

## Tools

| Tool | Purpose |
|---|---|
| `browser_start` | Start isolated Chromium (`headless`/`profileDir`/`cdpUrl`). |
| `browser_open` | Navigate tab (`url`, `waitUntil: load/domcontentloaded/networkidle/commit`). |
| `browser_snapshot` | Compact page text + visible interactive elements. |
| `browser_eval` | Evaluate JS in page and return JSON result. |
| `browser_wait` | Wait for selector `visible/hidden/attached/detached`. |
| `browser_batch` | Sequential batch of actions in one MCP call. |
| `browser_click` / `browser_fill` / `browser_press` / `browser_select` / `browser_hover` | Single interaction helpers. |
| `browser_back` / `browser_forward` / `browser_reload` | History navigation. |
| `browser_tabs` / `browser_tab_new` / `browser_tab_select` / `browser_tab_close` | Tab management. |
| `browser_screenshot` | Capture PNG to `.cmdr/artifacts/screenshot.png` (fullPage default). |
| `browser_close` | Close session (flushes pending downloads). |

## Navigation & tabs

- `browser_open` reuses the active tab. For parallel pages use `browser_tab_new {url}`.
- List tabs with `browser_tabs`, switch with `browser_tab_select {index}`, close with `browser_tab_close {index}`.

## Forms & interaction

- Fill with `browser_fill {selector, value}` (clears first) or via batch.
- Select with `browser_select {selector, values}`.
- Hover to reveal menus with `browser_hover`.
- Keyboard with `browser_press` (`Enter`, `Escape`, `Tab`, `ArrowDown`, `Control+A`, etc.).

## Extraction & downloads

- Prefer `browser_eval` over repeated snapshots for counts/lists/tables.
- Scroll via `browser_eval` e.g. `() => window.scrollTo(0, document.body.scrollHeight)`.
- Downloads triggered by clicks are auto-saved to `.cmdr/downloads` (deduplicated names).

## Screenshots & verification

- Use `browser_screenshot` to capture evidence or for visual review.
- After navigation or batch that changes the page, run `browser_snapshot` or `browser_eval` to confirm.

## Safety

Ask for confirmation before irreversible actions: purchases, publishing, deletion, sending messages. Keep artifacts under `.cmdr/`.
