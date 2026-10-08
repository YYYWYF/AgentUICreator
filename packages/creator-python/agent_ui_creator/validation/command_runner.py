from __future__ import annotations

import asyncio
import json
import os
import re
from pathlib import Path

from .models import CommandExecutionResult, CreatorValidationCommand


MAX_COMMAND_OUTPUT_BYTES = 100_000
COMMAND_TIMEOUT_SECONDS = 120

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
    """Match Project Control's resource-package detection, without npm guessing."""
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
        except (OSError, ValueError) as error:
            return CommandExecutionResult(f"Host validation command resolution failed: {error}", None, False)
        return await self.execute_arguments(arguments)

    async def execute_arguments(self, arguments_: tuple[str, ...]) -> CommandExecutionResult:
        """Host-only argv entry; never exposed as a model command tool."""
        executable, *arguments = arguments_
        try:
            process = await asyncio.create_subprocess_exec(
                executable,
                *arguments,
                cwd=self.project_root,
                env={
                    "CI": "1",
                    "FORCE_COLOR": "0",
                    "PATH": os.environ.get("PATH", ""),
                },
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            return CommandExecutionResult(str(error), None, False)

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
            return bytes(retained), truncated

        stdout_task = asyncio.create_task(drain(process.stdout))
        stderr_task = asyncio.create_task(drain(process.stderr))
        timed_out = False
        try:
            await asyncio.wait_for(
                process.wait(), timeout=COMMAND_TIMEOUT_SECONDS
            )
        except TimeoutError:
            timed_out = True
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except TimeoutError:
                process.kill()
                await process.wait()
        except BaseException:
            process.terminate()
            await process.wait()
            raise

        (stdout, stdout_truncated), (stderr, stderr_truncated) = await asyncio.gather(
            stdout_task, stderr_task
        )
        remaining = max(0, MAX_COMMAND_OUTPUT_BYTES - len(stdout))
        if len(stderr) > remaining:
            stderr = stderr[:remaining]
            stderr_truncated = True
        combined = stdout + stderr
        output = combined.decode("utf-8", errors="replace")
        if timed_out:
            output = (
                f"{output}\nCommand timed out after "
                f"{COMMAND_TIMEOUT_SECONDS * 1_000}ms."
            )
        return CommandExecutionResult(
            output=output,
            exit_code=None if timed_out else process.returncode,
            truncated=stdout_truncated or stderr_truncated,
        )
