import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  BrowserManager,
  resolveProfileDir,
  resolveRuntimePath,
} from "../browser/manager.js";
import { discoverSkills } from "../skills/registry.js";

const batchAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open"), url: z.url() }),
  z.object({ action: z.literal("click"), selector: z.string().min(1) }),
  z.object({
    action: z.literal("fill"),
    selector: z.string().min(1),
    value: z.string(),
  }),
  z.object({ action: z.literal("press"), key: z.string().min(1) }),
]);

const text = (value: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});

export async function startMcpServer(): Promise<void> {
  const browser = new BrowserManager();
  const server = new McpServer({ name: "cmdr-browser", version: "0.1.0" });

  server.registerTool(
    "browser_start",
    {
      description:
        "Start Cmdr's isolated Chromium browser (dedicated profile at .cmdr/profiles/default, separate from the client's built-in browser). Call this instead of any host browser. Options: headless/profileDir/cdpUrl.",
      inputSchema: z.object({
        headless: z.boolean().optional(),
        profileDir: z.string().optional(),
        cdpUrl: z.url().optional(),
      }),
    },
    async (input) => {
      const page = await browser.start(input);
      return text({
        url: page.url(),
        status: "ready",
        profileDir: input.cdpUrl ? undefined : resolveProfileDir(input),
      });
    },
  );

  server.registerTool(
    "browser_open",
    {
      description: "Navigate the active page to a URL.",
      inputSchema: z.object({ url: z.url() }),
    },
    async ({ url }) => {
      await browser.currentPage.goto(url, { waitUntil: "domcontentloaded" });
      return text({
        url: browser.currentPage.url(),
        title: await browser.currentPage.title(),
      });
    },
  );

  server.registerTool(
    "browser_snapshot",
    {
      description: "Read compact page text and visible interactive elements.",
      inputSchema: z.object({
        maxText: z.number().int().positive().max(50000).default(4000),
        maxElements: z.number().int().positive().max(500).default(100),
      }),
    },
    async ({ maxText, maxElements }) =>
      text(
        await browser.currentPage.evaluate(
          ({ textLimit, elementLimit }) => {
            const selector =
              'a[href],button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]';
            const elements = [...document.querySelectorAll(selector)]
              .filter((element) => {
                const style = getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return (
                  style.visibility !== "hidden" &&
                  style.display !== "none" &&
                  rect.width > 0 &&
                  rect.height > 0
                );
              })
              .slice(0, elementLimit)
              .map((element, index) => ({
                ref: `e${index + 1}`,
                tag: element.tagName.toLowerCase(),
                role: element.getAttribute("role") || undefined,
                name:
                  element.getAttribute("aria-label") ||
                  element.getAttribute("placeholder") ||
                  element.textContent
                    ?.trim()
                    .replace(/\s+/g, " ")
                    .slice(0, 160) ||
                  undefined,
                selector: element.id
                  ? `#${CSS.escape(element.id)}`
                  : element.getAttribute("name")
                    ? `${element.tagName.toLowerCase()}[name="${CSS.escape(element.getAttribute("name")!)}"]`
                    : undefined,
                href:
                  element instanceof HTMLAnchorElement
                    ? element.href
                    : undefined,
              }));
            return {
              url: location.href,
              title: document.title,
              text: document.body?.innerText.slice(0, textLimit) ?? "",
              elements,
            };
          },
          { textLimit: maxText, elementLimit: maxElements },
        ),
      ),
  );

  server.registerTool(
    "browser_batch",
    {
      description: "Run browser actions sequentially in one MCP call.",
      inputSchema: z.object({
        actions: z.array(batchAction).min(1).max(50),
      }),
    },
    async ({ actions }) => {
      const results: string[] = [];
      for (const action of actions) {
        if (action.action === "open") {
          await browser.currentPage.goto(action.url, {
            waitUntil: "domcontentloaded",
          });
          results.push(`opened ${browser.currentPage.url()}`);
        } else if (action.action === "click") {
          await browser.currentPage.locator(action.selector).first().click();
          results.push(`clicked ${action.selector}`);
        } else if (action.action === "fill") {
          await browser.currentPage
            .locator(action.selector)
            .first()
            .fill(action.value);
          results.push(`filled ${action.selector}`);
        } else {
          await browser.currentPage.keyboard.press(action.key);
          results.push(`pressed ${action.key}`);
        }
      }
      return text({ completed: results.length, results });
    },
  );

  server.registerTool(
    "browser_click",
    {
      description: "Click the first element matching a CSS selector.",
      inputSchema: z.object({ selector: z.string().min(1) }),
    },
    async ({ selector }) => {
      await browser.currentPage.locator(selector).first().click();
      return text({ clicked: selector });
    },
  );

  server.registerTool(
    "browser_fill",
    {
      description: "Fill an input matching a CSS selector.",
      inputSchema: z.object({ selector: z.string().min(1), value: z.string() }),
    },
    async ({ selector, value }) => {
      await browser.currentPage.locator(selector).first().fill(value);
      return text({ filled: selector });
    },
  );

  server.registerTool(
    "browser_press",
    {
      description: "Press a keyboard key on the active page.",
      inputSchema: z.object({ key: z.string().min(1) }),
    },
    async ({ key }) => {
      await browser.currentPage.keyboard.press(key);
      return text({ pressed: key });
    },
  );

  server.registerTool(
    "browser_screenshot",
    {
      description: "Capture the active page to a local PNG file.",
      inputSchema: z.object({
        path: z.string().default(".cmdr/artifacts/screenshot.png"),
        fullPage: z.boolean().default(true),
      }),
    },
    async ({ path, fullPage }) => {
      const output = resolveRuntimePath(path);
      await mkdir(dirname(output), { recursive: true });
      await browser.currentPage.screenshot({ path: output, fullPage });
      return text({ path: output });
    },
  );

  server.registerTool(
    "browser_tabs",
    {
      description: "List open tabs and their titles.",
      inputSchema: z.object({}),
    },
    async () =>
      text(
        await Promise.all(
          browser.pages().map(async (page, index) => ({
            index,
            url: page.url(),
            title: await page.title(),
          })),
        ),
      ),
  );

  server.registerTool(
    "browser_close",
    {
      description: "Close the managed browser session.",
      inputSchema: z.object({}),
    },
    async () => {
      await browser.close();
      return text("Browser closed.");
    },
  );

  server.registerTool(
    "list_skills",
    {
      description: "Discover locally installed Cmdr skills.",
      inputSchema: z.object({ root: z.string().optional() }),
    },
    async ({ root }) =>
      text(
        (await discoverSkills(root)).map(({ name, description, path }) => ({
          name,
          description,
          path,
        })),
      ),
  );

  server.registerTool(
    "read_skill",
    {
      description: "Read the full instructions for a locally installed skill.",
      inputSchema: z.object({
        name: z.string().min(1),
        root: z.string().optional(),
      }),
    },
    async ({ name, root }) => {
      const skill = (await discoverSkills(root)).find(
        (item) => item.name === name,
      );
      if (!skill) throw new Error(`Skill not found: ${name}`);
      return text(skill.instructions);
    },
  );

  const shutdown = async () => {
    await browser.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await server.connect(new StdioServerTransport());
}
