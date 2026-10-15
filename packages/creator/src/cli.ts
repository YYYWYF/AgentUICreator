#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import { createPythonCreatorClient } from "./PythonCreatorClient.js";
import { zhCN } from "./ui/i18n/zh-CN.js";
import { openCreatorBrowser } from "./openBrowser.js";

const messages = zhCN.launcher;
const { values } = parseArgs({
  options: {
    project: { type: "string", short: "p" },
    "config-root": { type: "string", short: "c" },
    message: { type: "string", short: "m" },
    help: { type: "boolean", short: "h" },
  }, strict: true,
});

if (values.help) {
  process.stdout.write(messages.help);
} else {
  try {
    const configRoot = path.resolve(values["config-root"] ?? process.cwd());
    if (values.message !== undefined) {
      const creator = createPythonCreatorClient({ projectRoot: path.resolve(values.project ?? process.cwd()), configRoot });
      try { process.stdout.write(`${(await creator.run(values.message)).message}\n`); }
      finally { await creator.dispose(); }
    } else {
      const { startCreatorWorkbench } = await import("./standaloneServer.js");
      const port = process.env.CREATOR_PORT === undefined ? undefined : Number(process.env.CREATOR_PORT);
      if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) throw new Error(messages.invalidPort);
      const app = await startCreatorWorkbench({
        configRoot,
        ...(port === undefined ? {} : { port }),
        ...(values.project === undefined ? {} : { projectRoot: path.resolve(values.project) }),
      });
      process.stdout.write(`${messages.started.replace("{0}", app.url)}\n${messages.stop}\n`);
      const stop = async () => {
        process.off("SIGINT", stop);
        process.off("SIGTERM", stop);
        process.off("disconnect", stop);
        try { await app.close(); }
        catch (error) { console.error(error); process.exitCode = 1; }
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      // A Node parent can disconnect IPC to stop cleanly on Windows as well.
      if (process.connected) process.on("disconnect", stop);
      if (process.env.CREATOR_OPEN_BROWSER !== "0") {
        try { await openCreatorBrowser(app.url); }
        catch { process.stderr.write(`${messages.browserUnavailable}\n`); }
      }
    }
  } catch (error) {
    process.stderr.write(`${messages.failed.replace("{0}", error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
}
