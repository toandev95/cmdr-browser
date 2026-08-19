import {
  chromium,
  type Browser,
  type BrowserContext,
  type Download,
  type Page,
} from "playwright";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, parse, resolve } from "node:path";

export type BrowserOptions = {
  headless?: boolean;
  profileDir?: string;
  cdpUrl?: string;
};

export function resolveRuntimePath(path: string): string {
  if (isAbsolute(path)) return path;

  const workingDirectory = process.cwd();
  const baseDirectory =
    workingDirectory === parse(workingDirectory).root
      ? homedir()
      : workingDirectory;
  return resolve(baseDirectory, path);
}

export function resolveProfileDir(options: BrowserOptions = {}): string {
  return resolveRuntimePath(options.profileDir ?? ".cmdr/profiles/default");
}

export class BrowserManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private pendingDownloads = new Set<Promise<void>>();
  private reservedDownloadPaths = new Set<string>();

  private async availableDownloadPath(
    downloadsDirectory: string,
    suggestedFilename: string,
  ): Promise<string> {
    const filename = basename(suggestedFilename) || "download";
    const extension = extname(filename);
    const stem = filename.slice(0, filename.length - extension.length);

    for (let index = 0; ; index += 1) {
      const candidate = resolve(
        downloadsDirectory,
        index === 0 ? filename : `${stem} (${index})${extension}`,
      );
      if (this.reservedDownloadPaths.has(candidate)) continue;
      try {
        await access(candidate);
      } catch {
        if (this.reservedDownloadPaths.has(candidate)) continue;
        this.reservedDownloadPaths.add(candidate);
        return candidate;
      }
    }
  }

  private trackDownloads(page: Page, downloadsDirectory: string): void {
    page.on("download", (download: Download) => {
      const save = (async () => {
        const output = await this.availableDownloadPath(
          downloadsDirectory,
          download.suggestedFilename(),
        );
        await download.saveAs(output);
      })();
      this.pendingDownloads.add(save);
      void save
        .catch((error: unknown) => {
          console.error("Failed to save browser download:", error);
        })
        .finally(() => this.pendingDownloads.delete(save));
    });
  }

  async start(options: BrowserOptions = {}): Promise<Page> {
    if (this.page) return this.page;
    const downloadsDirectory = resolveRuntimePath(".cmdr/downloads");
    await mkdir(downloadsDirectory, { recursive: true });
    if (options.cdpUrl) {
      this.browser = await chromium.connectOverCDP(options.cdpUrl);
      this.context =
        this.browser.contexts()[0] ?? (await this.browser.newContext());
      this.context.on("page", (page) =>
        this.trackDownloads(page, downloadsDirectory),
      );
      for (const page of this.context.pages()) {
        this.trackDownloads(page, downloadsDirectory);
      }
      this.page = this.context.pages()[0] ?? (await this.context.newPage());
      return this.page;
    }
    const profileDir = resolveProfileDir(options);
    const temporaryDownloadsDirectory = resolveRuntimePath(
      ".cmdr/tmp/downloads",
    );
    await mkdir(profileDir, { recursive: true });
    await mkdir(temporaryDownloadsDirectory, { recursive: true });
    this.context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless: options.headless ?? false,
      chromiumSandbox: true,
      viewport: null,
      acceptDownloads: true,
      downloadsPath: temporaryDownloadsDirectory,
    });
    this.context.on("page", (page) =>
      this.trackDownloads(page, downloadsDirectory),
    );
    for (const page of this.context.pages()) {
      this.trackDownloads(page, downloadsDirectory);
    }
    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    return this.page;
  }

  get currentPage(): Page {
    if (!this.page)
      throw new Error("Browser is not started. Call browser_start first.");
    return this.page;
  }

  async newTab(url?: string): Promise<Page> {
    if (!this.context) throw new Error("Browser is not started. Call browser_start first.");
    const page = await this.context.newPage();
    const downloadsDirectory = resolveRuntimePath(".cmdr/downloads");
    this.trackDownloads(page, downloadsDirectory);
    if (url) await page.goto(url, { waitUntil: "domcontentloaded" });
    this.page = page;
    return page;
  }

  async selectTab(index: number): Promise<void> {
    if (!this.context) throw new Error("Browser is not started. Call browser_start first.");
    const pages = this.context.pages();
    if (index < 0 || index >= pages.length) throw new Error(`Tab index out of range: ${index}`);
    this.page = pages[index];
    await this.page.bringToFront();
  }

  async closeTab(index: number): Promise<void> {
    if (!this.context) throw new Error("Browser is not started. Call browser_start first.");
    const pages = this.context.pages();
    if (index < 0 || index >= pages.length) throw new Error(`Tab index out of range: ${index}`);
    const closing = pages[index];
    const wasActive = closing === this.page;
    await closing.close();
    if (wasActive) this.page = this.context.pages()[0];
    if (!this.page && this.context.pages().length === 0) this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.pendingDownloads);
    await this.context?.close();
    if (this.browser?.isConnected()) await this.browser.close();
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
    this.reservedDownloadPaths.clear();
  }

  pages(): Page[] {
    return this.context?.pages() ?? [];
  }
}
