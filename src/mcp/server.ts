import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { BrowserManager, resolveProfileDir, resolveRuntimePath } from "../browser/manager.js";
import { discoverSkills } from "../skills/registry.js";

const batchAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), url: z.url() }),
  z.object({ action: z.literal("click"), selector: z.string().min(1) }),
  z.object({ action: z.literal("fill"), selector: z.string().min(1), value: z.string() }),
  z.object({ action: z.literal("press"), key: z.string().min(1) }),
  z.object({ action: z.literal("select"), selector: z.string().min(1), values: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("hover"), selector: z.string().min(1) }),
  z.object({ action: z.literal("wait"), selector: z.string().min(1), state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible"), timeout: z.number().int().positive().max(60000).default(10000) }),
  z.object({ action: z.literal("eval"), expression: z.string().min(1) }),
]);

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

export async function startMcpServer(): Promise<void> {
  const browser = new BrowserManager();
  const server = new McpServer({ name: "cmdr-browser", version: "0.1.0" });

  server.registerTool("browser_start", { description: "Start Cmdr's isolated Chromium browser (dedicated profile at .cmdr/profiles/default, separate from the client's built-in browser). Call this before any other browser_* tool. Options: headless/profileDir/cdpUrl.", inputSchema: z.object({ headless: z.boolean().optional(), profileDir: z.string().optional(), cdpUrl: z.url().optional() }) }, async (input) => {
    const page = await browser.start(input);
    return text({ url: page.url(), status: "ready", profileDir: input.cdpUrl ? undefined : resolveProfileDir(input) });
  });

  server.registerTool("browser_open", { description: "Navigate the active tab to a URL. Waits for domcontentloaded.", inputSchema: z.object({ url: z.url(), waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).default("domcontentloaded") }) }, async ({ url, waitUntil }) => {
    await browser.currentPage.goto(url, { waitUntil });
    return text({ url: browser.currentPage.url(), title: await browser.currentPage.title() });
  });

  server.registerTool("browser_snapshot", { description: "Capture compact page text + visible interactive elements (ref/selector/href). Always call before choosing selectors. Use refs from elements to build selectors; verify with browser_eval if needed.", inputSchema: z.object({ maxText: z.number().int().positive().max(50000).default(4000), maxElements: z.number().int().positive().max(500).default(120) }) }, async ({ maxText, maxElements }) => text(await browser.currentPage.evaluate(({ textLimit, elementLimit }) => {
    const sel = 'a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"],[onclick]';
    const elements = [...document.querySelectorAll(sel)].filter((el) => {
      const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
    }).slice(0, elementLimit).map((el, i) => ({
      ref: `e${i + 1}`, tag: el.tagName.toLowerCase(), role: el.getAttribute("role") || undefined,
      type: (el as HTMLInputElement).type || undefined,
      name: el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent?.trim().replace(/\s+/g, " ").slice(0, 160) || undefined,
      selector: el.id ? `#${CSS.escape(el.id)}` : el.getAttribute("name") ? `${el.tagName.toLowerCase()}[name="${CSS.escape(el.getAttribute("name")!)}"]` : el.getAttribute("aria-label") ? `${el.tagName.toLowerCase()}[aria-label="${CSS.escape(el.getAttribute("aria-label")!)}"]` : undefined,
      href: el instanceof HTMLAnchorElement ? el.href : undefined,
    }));
    return { url: location.href, title: document.title, text: document.body?.innerText.slice(0, textLimit) ?? "", elements };
  }, { textLimit: maxText, elementLimit: maxElements })));

  server.registerTool("browser_eval", { description: "Evaluate JavaScript in the page context and return the result. Use for reading state, extracting tables/lists, checking visibility, or scrolling. Example: () => document.querySelectorAll('.item').length", inputSchema: z.object({ expression: z.string().min(1) }) }, async ({ expression }) => {
    const fn = new Function(`return (${expression})`) as () => unknown;
    // Run via page.evaluate to get proper serialization
    const result = await browser.currentPage.evaluate((expr) => {
      // eslint-disable-next-line no-new-func
      const f = new Function(`return (${expr})`);
      const v = (f as () => unknown)();
      return v instanceof Promise ? v.then((x) => x as unknown) : v as unknown;
    }, expression);
    return text(result as unknown);
  });

  server.registerTool("browser_wait", { description: "Wait for a selector to reach a state (visible/hidden/attached/detached) or timeout. Use after navigation/click that triggers async rendering.", inputSchema: z.object({ selector: z.string().min(1), state: z.enum(["visible", "hidden", "attached", "detached"]).default("visible"), timeout: z.number().int().positive().max(60000).default(10000) }) }, async ({ selector, state, timeout }) => {
    await browser.currentPage.locator(selector).first().waitFor({ state, timeout });
    return text({ waited: selector, state });
  });

  server.registerTool("browser_batch", { description: "Run multiple browser actions sequentially in one call (open/click/fill/press/select/hover/wait/eval). Prefer this over separate calls when actions are independent.", inputSchema: z.object({ actions: z.array(batchAction).min(1).max(50) }) }, async ({ actions }) => {
    const results: string[] = [];
    for (const a of actions) {
      if (a.action === "open") { await browser.currentPage.goto(a.url, { waitUntil: "domcontentloaded" }); results.push(`opened ${browser.currentPage.url()}`); }
      else if (a.action === "click") { await browser.currentPage.locator(a.selector).first().click(); results.push(`clicked ${a.selector}`); }
      else if (a.action === "fill") { await browser.currentPage.locator(a.selector).first().fill(a.value); results.push(`filled ${a.selector}`); }
      else if (a.action === "press") { await browser.currentPage.keyboard.press(a.key); results.push(`pressed ${a.key}`); }
      else if (a.action === "select") { await browser.currentPage.locator(a.selector).first().selectOption(a.values); results.push(`selected ${a.selector} -> ${a.values.join(",")}`); }
      else if (a.action === "hover") { await browser.currentPage.locator(a.selector).first().hover(); results.push(`hovered ${a.selector}`); }
      else if (a.action === "wait") { await browser.currentPage.locator(a.selector).first().waitFor({ state: a.state, timeout: a.timeout }); results.push(`waited ${a.selector}:${a.state}`); }
      else { const r = await browser.currentPage.evaluate((expr) => { const f = new Function(`return (${expr})`); return (f as () => unknown)() as unknown; }, a.expression); results.push(`eval -> ${JSON.stringify(r)}`); }
    }
    return text({ completed: results.length, results });
  });

  server.registerTool("browser_click", { description: "Click the first element matching a CSS selector.", inputSchema: z.object({ selector: z.string().min(1) }) }, async ({ selector }) => { await browser.currentPage.locator(selector).first().click(); return text({ clicked: selector }); });
  server.registerTool("browser_fill", { description: "Fill an input/textarea matching a CSS selector (clears first).", inputSchema: z.object({ selector: z.string().min(1), value: z.string() }) }, async ({ selector, value }) => { await browser.currentPage.locator(selector).first().fill(value); return text({ filled: selector }); });
  server.registerTool("browser_press", { description: "Press a keyboard key (e.g. Enter, Escape, ArrowDown, Tab, Control+A).", inputSchema: z.object({ key: z.string().min(1) }) }, async ({ key }) => { await browser.currentPage.keyboard.press(key); return text({ pressed: key }); });
  server.registerTool("browser_select", { description: "Select option(s) in a <select> element.", inputSchema: z.object({ selector: z.string().min(1), values: z.array(z.string()).min(1) }) }, async ({ selector, values }) => { await browser.currentPage.locator(selector).first().selectOption(values); return text({ selected: selector, values }); });
  server.registerTool("browser_hover", { description: "Hover over an element (useful to reveal menus/tooltips).", inputSchema: z.object({ selector: z.string().min(1) }) }, async ({ selector }) => { await browser.currentPage.locator(selector).first().hover(); return text({ hovered: selector }); });

  server.registerTool("browser_back", { description: "Go back in history.", inputSchema: z.object({}) }, async () => { await browser.currentPage.goBack({ waitUntil: "domcontentloaded" }); return text({ url: browser.currentPage.url() }); });
  server.registerTool("browser_forward", { description: "Go forward in history.", inputSchema: z.object({}) }, async () => { await browser.currentPage.goForward({ waitUntil: "domcontentloaded" }); return text({ url: browser.currentPage.url() }); });
  server.registerTool("browser_reload", { description: "Reload the active tab.", inputSchema: z.object({}) }, async () => { await browser.currentPage.reload({ waitUntil: "domcontentloaded" }); return text({ url: browser.currentPage.url() }); });

  server.registerTool("browser_tabs", { description: "List open tabs (index/url/title). Use browser_tab_select to switch.", inputSchema: z.object({}) }, async () => text(await Promise.all(browser.pages().map(async (p, i) => ({ index: i, url: p.url(), title: await p.title() })))));
  server.registerTool("browser_tab_new", { description: "Open a new tab (optionally navigate to url) and make it active.", inputSchema: z.object({ url: z.url().optional() }) }, async ({ url }) => {
    const p = await browser.newTab(url);
    return text({ index: browser.pages().length - 1, url: p.url() });
  });
  server.registerTool("browser_tab_select", { description: "Switch active tab by index (see browser_tabs).", inputSchema: z.object({ index: z.number().int().min(0) }) }, async ({ index }) => {
    await browser.selectTab(index);
    return text({ active: index, url: browser.currentPage.url() });
  });
  server.registerTool("browser_tab_close", { description: "Close tab by index.", inputSchema: z.object({ index: z.number().int().min(0) }) }, async ({ index }) => {
    await browser.closeTab(index);
    return text({ closed: index, remaining: browser.pages().length });
  });

  server.registerTool("browser_screenshot", { description: "Capture the active page to a local PNG file.", inputSchema: z.object({ path: z.string().default(".cmdr/artifacts/screenshot.png"), fullPage: z.boolean().default(true) }) }, async ({ path, fullPage }) => {
    const output = resolveRuntimePath(path); await mkdir(dirname(output), { recursive: true });
    await browser.currentPage.screenshot({ path: output, fullPage }); return text({ path: output });
  });

  server.registerTool("browser_close", { description: "Close the managed browser session.", inputSchema: z.object({}) }, async () => { await browser.close(); return text("Browser closed."); });
  server.registerTool("list_skills", { description: "Discover locally installed Cmdr skills.", inputSchema: z.object({ root: z.string().optional() }) }, async ({ root }) => text((await discoverSkills(root)).map(({ name, description, path }) => ({ name, description, path }))));
  server.registerTool("read_skill", { description: "Read the full instructions for a locally installed skill.", inputSchema: z.object({ name: z.string().min(1), root: z.string().optional() }) }, async ({ name, root }) => {
    const skill = (await discoverSkills(root)).find((item) => item.name === name);
    if (!skill) throw new Error(`Skill not found: ${name}`); return text(skill.instructions);
  });

  const shutdown = async () => { await browser.close(); process.exit(0); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}
