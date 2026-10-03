from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

from .models import CommandExecutionResult, CreatorValidationCommand


MAX_COMMAND_OUTPUT_BYTES = 100_000
COMMAND_TIMEOUT_SECONDS = 120

_COMMANDS: dict[CreatorValidationCommand, tuple[str, ...]] = {
    "pnpm verify:ui": ("pnpm", "verify:ui"),
    "pnpm typecheck": ("pnpm", "typecheck"),
}


class CreatorValidationCommandRunner:
    """Run only the host-owned completion validation allowlist without a shell."""

    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root).resolve()

    async def execute_known_command(
        self, command: CreatorValidationCommand
    ) -> CommandExecutionResult:
        return await self.execute_arguments(_COMMANDS[command])

    async def execute_target_project_typecheck(self) -> CommandExecutionResult:
        """Run the target project's own script with its declared package manager."""
        try:
            package = json.loads((self.project_root / "package.json").read_text())
            if not isinstance(package, dict) or not isinstance(package.get("scripts"), dict) or "typecheck" not in package["scripts"]:
                return CommandExecutionResult("Target project has no typecheck script.", None, False)
            declared = package.get("packageManager")
            manager = declared.split("@", 1)[0] if isinstance(declared, str) else None
            if manager is None:
                for directory in (self.project_root, *self.project_root.parents):
                    parent_package = directory / "package.json"
                    if parent_package != self.project_root / "package.json" and parent_package.exists():
                        parent_declared = json.loads(parent_package.read_text()).get("packageManager")
                        if isinstance(parent_declared, str):
                            manager = parent_declared.split("@", 1)[0]
                    if manager is None:
                        for lockfile, candidate in (
                            ("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"),
                            ("package-lock.json", "npm"), ("bun.lock", "bun"),
                            ("bun.lockb", "bun"),
                        ):
                            if (directory / lockfile).exists():
                                manager = candidate
                                break
                    if manager is not None:
                        break
            manager = manager or "npm"
            commands = {
                "pnpm": ("pnpm", "typecheck"),
                "yarn": ("yarn", "typecheck"),
                "npm": ("npm", "run", "typecheck"),
                "bun": ("bun", "run", "typecheck"),
            }
            if manager not in commands:
                return CommandExecutionResult("Target project package manager is unavailable.", None, False)
            return await self.execute_arguments(commands[manager])
        except (OSError, ValueError, TypeError) as error:
            return CommandExecutionResult(str(error), None, False)

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
