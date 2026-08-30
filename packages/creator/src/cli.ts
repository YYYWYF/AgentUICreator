#!/usr/bin/env node

import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { createProjectCreatorSession } from "./createProjectCreatorSession.js";

const HELP = `Agent UI Creator

用法：
  agent-ui-creator --project <目录>
  agent-ui-creator --project <目录> --message <需求>

选项：
  -p, --project      要修改的 Agent 前端项目，默认是当前目录
  -c, --config-root  .env.creator.local 所在目录，默认是当前目录
  -m, --message      执行一次需求后退出
  -h, --help         显示帮助
`;

const { values } = parseArgs({
  options: {
    project: { type: "string", short: "p" },
    "config-root": { type: "string", short: "c" },
    message: { type: "string", short: "m" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help === true) {
  process.stdout.write(HELP);
  process.exitCode = 0;
} else {
  const projectRoot = path.resolve(values.project ?? process.cwd());
  const configRoot = path.resolve(values["config-root"] ?? process.cwd());

  try {
    await access(projectRoot);
    const session = createProjectCreatorSession({ projectRoot, configRoot });

    if (values.message !== undefined) {
      const result = await session.run(values.message);
      process.stdout.write(`${result.message}\n`);
    } else {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      process.stdout.write(
        `Creator 已连接项目：${projectRoot}\n输入需求开始修改；输入 /exit 退出。\n`,
      );

      try {
        while (true) {
          const request = (await terminal.question("Creator> ")).trim();
          if (request === "/exit" || request === "/quit") {
            break;
          }
          if (request === "") {
            continue;
          }

          try {
            const result = await session.run(request);
            process.stdout.write(`${result.message}\n`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            process.stderr.write(`错误：${message}\n`);
          }
        }
      } finally {
        terminal.close();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Creator 启动失败：${message}\n`);
    process.exitCode = 1;
  }
}
