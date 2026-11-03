import { test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/** Capture native window errors even when a dev server prevents their default
 * handling before Playwright's pageerror event can observe them. */
export async function captureWindowErrors(page: Page, errors: string[]) {
  const info = test.info();
  const diagnostic = process.env.AGENT_UI_RESIZE_DIAGNOSTICS === "1";
  await page.exposeBinding("__agentUITestWindowError", async ({ frame }, message: string, observed: unknown) => {
    errors.push(message);
    if (diagnostic) {
      const file = info.outputPath(`window-error-${errors.length}.json`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ url: frame.url(), message, observed }, null, 2));
      await info.attach("window-error", { path: file, contentType: "application/json" });
    }
  });
  await page.addInitScript(diagnostic => {
    const observed: { stack: string | undefined; targets: string[]; time: number }[] = [];
    if (diagnostic) {
      const Original = window.ResizeObserver;
      window.ResizeObserver = class extends Original {
        constructor(callback: ResizeObserverCallback) {
          const stack = new Error().stack;
          super((entries, observer) => {
            observed.push({ stack, time: performance.now(), targets: entries.map(entry => `${entry.target.tagName}.${entry.target.getAttribute("class")} [${entry.target.getAttribute("data-slot")}] ${entry.contentRect.width}x${entry.contentRect.height}`) });
            if (observed.length > 40) observed.shift();
            callback(entries, observer);
          });
        }
      };
    }
    window.addEventListener("error", event => {
      if (!event.message) return;
      const report = (window as Window & { __agentUITestWindowError?: (message: string, observed: unknown) => Promise<unknown> }).__agentUITestWindowError;
      if (report) void report(event.message, diagnostic ? [...observed] : undefined).catch(() => { /* The owning page may close during cleanup. */ });
    });
    window.addEventListener("unhandledrejection", event => {
      const report = (window as Window & { __agentUITestWindowError?: (message: string, observed: unknown) => Promise<unknown> }).__agentUITestWindowError;
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (report) void report(`Unhandled rejection: ${message}`, diagnostic ? [...observed] : undefined).catch(() => {});
    });
  }, diagnostic);
}
