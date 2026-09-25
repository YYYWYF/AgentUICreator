import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { promisify } from "node:util";

import { CreatorWorkspaceError } from "./CreatorWorkspaceManager.js";

const execFileAsync = promisify(execFile);
let pickerOpen = false;

/** Show the local development host's system folder chooser. */
export async function chooseProjectDirectory(startDirectory: string): Promise<string | undefined> {
  if (pickerOpen) {
    throw new CreatorWorkspaceError("CREATOR_WORKSPACE_PICKER_BUSY", "已有文件夹选择窗口，请先完成或取消。");
  }
  pickerOpen = true;
  try {
    const startPath = await realpath(startDirectory).catch(() => homedir());
    let stdout: string;
    if (process.platform === "darwin") {
      ({ stdout } = await execFileAsync("osascript", [
        "-e",
        'on run argv\nset startFolder to POSIX file (item 1 of argv) as alias\nreturn POSIX path of (choose folder with prompt "选择前端项目文件夹" default location startFolder)\nend run',
        startPath,
      ]));
    } else if (process.platform === "win32") {
      ({ stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile", "-STA", "-Command",
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "选择前端项目文件夹"; $dialog.SelectedPath = $env:AGENT_UI_PICKER_START_DIRECTORY; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
      ], { env: { ...process.env, AGENT_UI_PICKER_START_DIRECTORY: startPath } }));
    } else {
      ({ stdout } = await execFileAsync("zenity", [
        "--file-selection", "--directory", "--title=选择前端项目文件夹", `--filename=${startPath}/`,
      ]));
    }
    return stdout.trim() || undefined;
  } catch (error) {
    const failure = error as Error & { code?: string | number; stderr?: string };
    if ((process.platform === "darwin" && /-128/u.test(`${failure.stderr ?? ""} ${failure.message}`)) ||
        (process.platform === "linux" && (failure.code === 1 || failure.code === "1"))) {
      return undefined;
    }
    throw new CreatorWorkspaceError(
      "CREATOR_WORKSPACE_PICKER_UNAVAILABLE",
      "无法打开系统文件夹选择窗口。请使用下方的手动路径入口。",
    );
  } finally {
    pickerOpen = false;
  }
}
