from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import signal
import subprocess
import sys
from pathlib import Path

from .models import CommandExecutionResult, CreatorValidationCommand


MAX_COMMAND_OUTPUT_BYTES = 100_000
COMMAND_TIMEOUT_SECONDS = 120
PROCESS_TERMINATE_SECONDS = 2
PROCESS_KILL_SECONDS = 2
PIPE_DRAIN_SECONDS = 2

# Legacy identifiers are private allowlist keys, not executable commands.
_SCRIPTS: dict[CreatorValidationCommand, str] = {
    "pnpm verify:ui": "verify:ui",
    "pnpm typecheck": "typecheck",
    "pnpm build": "build",
}
_LOCKFILES = {
    "pnpm-lock.yaml": "pnpm", "yarn.lock": "yarn",
    "package-lock.json": "npm", "bun.lock": "bun", "bun.lockb": "bun",
}


def _package_manager_at(root: Path, *, inherited: bool = False) -> str | None:
    """Match Operator's resource-package detection, without npm guessing."""
    manifest_path = root / "package.json"
    if not manifest_path.is_file():
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("Invalid package.json: expected an object.")
    if inherited and not ((root / "pnpm-workspace.yaml").exists() or "workspaces" in manifest):
        return None
    if "packageManager" in manifest:
        declared = manifest["packageManager"]
        if not isinstance(declared, str) or not re.fullmatch(r"(pnpm|yarn|npm|bun)@[^\s]+", declared):
            raise ValueError("Unsupported project packageManager.")
        return declared.split("@", 1)[0]
    detected = {manager for file, manager in _LOCKFILES.items() if (root / file).exists()}
    if len(detected) > 1:
        raise ValueError("Multiple package manager lockfiles; select a packageManager in package.json.")
    return next(iter(detected), None)


class CreatorValidationCommandRunner:
    """Run only the host-owned completion validation allowlist without a shell."""

    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root).resolve()

    def resolve_arguments(self, command: CreatorValidationCommand) -> tuple[str, ...]:
        script = _SCRIPTS[command]
        manifest = json.loads((self.project_root / "package.json").read_text(encoding="utf-8"))
        scripts = manifest.get("scripts") if isinstance(manifest, dict) else None
        if not isinstance(scripts, dict) or not isinstance(scripts.get(script), str) or not scripts[script].strip():
            raise ValueError(f"Target Host package.json has no executable '{script}' script.")
        manager = _package_manager_at(self.project_root)
        if manager is None:
            for ancestor in self.project_root.parents:
                manager = _package_manager_at(ancestor, inherited=True)
                if manager is not None:
                    break
        if manager is None:
            raise ValueError("Cannot determine target Host package manager from package.json, lockfiles or enclosing workspace.")
        # Explicit run avoids built-in commands shadowing a Host script.
        return (manager, "run", script)

    def command_label(self, command: CreatorValidationCommand) -> str:
        try:
            return " ".join(self.resolve_arguments(command))
        except (OSError, ValueError):
            return f"{_SCRIPTS[command]} (not executed)"

    async def execute_known_command(
        self, command: CreatorValidationCommand
    ) -> CommandExecutionResult:
        try:
            arguments = self.resolve_arguments(command)
        except PermissionError as error:
            return CommandExecutionResult(f"Host validation command resolution failed: {error}", None, False, "permission")
        except (OSError, ValueError) as error:
            return CommandExecutionResult(f"Host validation command resolution failed: {error}", None, False, "configuration")
        return await self.execute_arguments(arguments)

    async def execute_arguments(self, arguments_: tuple[str, ...]) -> CommandExecutionResult:
        """Host-only argv entry; never exposed as a model command tool."""
        executable, *arguments = arguments_
        job = None
        if os.name == "nt":
            resolved = shutil.which(executable)
            if resolved is None:
                return CommandExecutionResult(f"Executable unavailable: {executable}", None, False, "start_failed")
            executable = resolved
            from .windows_job import WindowsJob
            try:
                job = WindowsJob()
            except OSError as error:
                return CommandExecutionResult(str(error), None, False,
                                              "permission" if isinstance(error, PermissionError) else "start_failed")
        if job is not None:
            # Gate child creation until the wrapper belongs to the Job. This
            # closes the launch/assignment race, including very short commands.
            arguments = ["-c", "import sys,subprocess; sys.stdin.buffer.read(1); sys.exit(subprocess.call(sys.argv[1:]))", executable, *arguments]
            executable = sys.executable
        try:
            process = await asyncio.create_subprocess_exec(
                executable,
                *arguments,
                cwd=self.project_root,
                **process_group_options(),
                env={
                    "CI": "1",
                    "FORCE_COLOR": "0",
                    "PATH": os.environ.get("PATH", ""),
                    **{key: value for key, value in os.environ.items()
                       if os.name == "nt" and key.upper() in {"SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP"}},
                },
                stdin=asyncio.subprocess.PIPE if job is not None else asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except BaseException as error:
            if job is not None:
                job.close()
            if not isinstance(error, OSError):
                raise
            return CommandExecutionResult(str(error), None, False,
                                          "permission" if isinstance(error, PermissionError) else "start_failed")

        partial_output: dict[int, tuple[bytes, bool]] = {}

        async def drain(stream: asyncio.StreamReader | None) -> tuple[bytes, bool]:
            if stream is None:
                return b"", False
            retained = bytearray()
            truncated = False
            while chunk := await stream.read(16_384):
                remaining = MAX_COMMAND_OUTPUT_BYTES - len(retained)
                if remaining > 0:
                    retained.extend(chunk[:remaining])
                truncated = truncated or len(chunk) > remaining
                partial_output[id(stream)] = (bytes(retained), truncated)
            return bytes(retained), truncated

        stdout_task = asyncio.create_task(drain(process.stdout))
        stderr_task = asyncio.create_task(drain(process.stderr))
        failure_kind = None
        try:
            if job is not None:
                job.attach(process.pid)
                process.stdin.write(b"1")
                await process.stdin.drain()
                process.stdin.close()
            await asyncio.wait_for(wait_for_process_exit(process), timeout=COMMAND_TIMEOUT_SECONDS)
            await asyncio.wait_for(
                asyncio.gather(stdout_task, stderr_task), timeout=PIPE_DRAIN_SECONDS,
            )
        except TimeoutError:
            failure_kind = "timeout"
        except OSError as error:
            failure_kind = "permission" if isinstance(error, PermissionError) else "start_failed"
            startup_error = str(error)
        finally:
            # Shield cleanup so cancellation still waits for the bounded tree cleanup.
            cleanup = asyncio.create_task(cleanup_process_tree(process, job))
            cancelled_during_cleanup = False
            try:
                while not cleanup.done():
                    try:
                        await asyncio.shield(cleanup)
                    except asyncio.CancelledError:
                        cancelled_during_cleanup = True
                cleanup.result()
            finally:
                for task in (stdout_task, stderr_task):
                    if not task.done():
                        task.cancel()
                await asyncio.wait_for(
                    asyncio.gather(stdout_task, stderr_task, return_exceptions=True),
                    timeout=PIPE_DRAIN_SECONDS,
                )
            if cancelled_during_cleanup:
                raise asyncio.CancelledError

        def retained(task, stream):
            if task.cancelled() or task.exception():
                return partial_output.get(id(stream), (b"", True))[0], True
            return task.result()

        stdout, stdout_truncated = retained(stdout_task, process.stdout)
        stderr, stderr_truncated = retained(stderr_task, process.stderr)
        remaining = max(0, MAX_COMMAND_OUTPUT_BYTES - len(stdout))
        if len(stderr) > remaining:
            stderr = stderr[:remaining]
            stderr_truncated = True
        combined = stdout + stderr
        output = combined.decode("utf-8", errors="replace")
        if failure_kind == "timeout":
            output = (
                f"{output}\nCommand timed out after "
                f"{COMMAND_TIMEOUT_SECONDS * 1_000}ms or output pipe drain exceeded its budget."
            )
        return CommandExecutionResult(
            output=startup_error if failure_kind in {"start_failed", "permission"} else output,
            exit_code=None if failure_kind else process.returncode,
            truncated=stdout_truncated or stderr_truncated,
            failure_kind=failure_kind,
        )


def process_group_options() -> dict[str, object]:
    if os.name == "nt":
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    return {"start_new_session": True}


async def wait_for_process_exit(process) -> None:
    # asyncio Process.wait can also wait for inherited pipes to close. Observe
    # exit independently so pipe EOF has its own (shorter) drain deadline.
    while process.returncode is None:
        await asyncio.sleep(0.02)


async def cleanup_process_tree(process, job=None) -> None:
    """Bound both termination waits, including when descendants retain pipes."""
    def send(force: bool) -> None:
        try:
            if job is not None:
                if force:
                    job.close()
                elif process.returncode is None:
                    process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
        except OSError:
            pass

    try:
        send(False)
        try:
            await asyncio.wait_for(process.wait(), PROCESS_TERMINATE_SECONDS)
        except TimeoutError:
            pass
    finally:
        # Parent exit is not proof of descendant exit. Always escalate the tree.
        send(True)
        if process.returncode is None:
            try:
                process.kill()  # also reaps a Windows wrapper if Job assignment failed
            except ProcessLookupError:
                pass
        try:
            await asyncio.wait_for(process.wait(), PROCESS_KILL_SECONDS)
        except TimeoutError:
            pass
        finally:
            if job is not None:
                job.close()
