from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

from .errors import ProjectControlError
from .models import (
    MAX_PROJECT_CONTROL_OUTPUT_BYTES,
    PROJECT_CONTROL_ENTRY_PATH,
    PROJECT_CONTROL_SCHEMA_VERSION,
    PROJECT_CONTROL_TIMEOUT_SECONDS,
    ProjectControlMetrics,
    ProjectControlOperation,
)

_ERROR_DETAIL_LIMIT = 2_000
_TERMINATE_TIMEOUT_SECONDS = 1.0


def _load_protocol_validator() -> Draft202012Validator:
    repository_root = Path(__file__).resolve().parents[4]
    contracts_root = repository_root / "contracts" / "creator"
    schema_paths = (
        contracts_root / "project-control.schema.json",
        contracts_root / "app-ui-model-operation.schema.json",
    )
    try:
        schemas = [json.loads(path.read_text(encoding="utf-8")) for path in schema_paths]
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("ProjectControl JSON Schema is unavailable.") from error
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas
    )
    return Draft202012Validator(schemas[0], registry=registry)


class _OutputLimitExceeded(Exception):
    pass


class ProjectControlClient:
    """JSON protocol transport for the target project's fixed control entry."""

    def __init__(
        self,
        *,
        project_root: Path,
        timeout_seconds: float = PROJECT_CONTROL_TIMEOUT_SECONDS,
        max_output_bytes: int = MAX_PROJECT_CONTROL_OUTPUT_BYTES,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self.entry_path = self.project_root / PROJECT_CONTROL_ENTRY_PATH
        runtime_name = "tsx.cmd" if os.name == "nt" else "tsx"
        self.executable_path = self.project_root / "node_modules" / ".bin" / runtime_name
        self.metrics = ProjectControlMetrics()
        self._validator = _load_protocol_validator()

    async def inspect_ui_project(self) -> dict[str, Any]:
        return await self._request("inspect_ui_project", {})

    async def inspect_app_ui_model(self) -> dict[str, Any]:
        return await self._request("inspect_app_ui_model", {})

    async def list_ui_plugins(self) -> dict[str, Any]:
        return await self._request("list_ui_plugins", {})

    async def inspect_ui_slots(self, *, root: str | None = None) -> dict[str, Any]:
        return await self._request(
            "inspect_ui_slots", {} if root is None else {"root": root}
        )

    async def inspect_ui_plugin(self, plugin_id: str) -> dict[str, Any]:
        return await self._request("inspect_ui_plugin", {"pluginId": plugin_id})

    async def inspect_ui_plugin_source_references(
        self, plugin_id: str
    ) -> dict[str, Any]:
        return await self._request(
            "inspect_ui_plugin_source_references", {"pluginId": plugin_id}
        )

    async def request_app_ui_model_mutation(
        self, input: dict[str, Any]
    ) -> dict[str, Any]:
        """Internal transport used only by AppUIModelMutationService."""
        return await self._request("mutate_app_ui_model", input)

    async def _request(
        self,
        operation: ProjectControlOperation,
        input: dict[str, Any],
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        failed = True
        try:
            self._ensure_fixed_runtime()
            request = {
                "schemaVersion": PROJECT_CONTROL_SCHEMA_VERSION,
                "operation": operation,
                "input": input,
            }
            self._validate_protocol(request, request=True)
            stdout, stderr, exit_code = await self._execute(
                json.dumps(request, ensure_ascii=False, separators=(",", ":")).encode()
            )
            try:
                decoded = json.loads(stdout.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ProjectControlError(
                    "CONTROL_PROTOCOL_INVALID_JSON",
                    "The target project control entry did not return valid JSON.",
                    {
                        "stdout": stdout.decode("utf-8", errors="replace")[:_ERROR_DETAIL_LIMIT],
                        "stderr": stderr.decode("utf-8", errors="replace")[:_ERROR_DETAIL_LIMIT],
                        "cause": str(error),
                    },
                ) from error
            self._validate_protocol(decoded, request=False)
            if not decoded["ok"]:
                target_error = decoded["error"]
                raise ProjectControlError(
                    target_error["code"],
                    target_error["message"],
                    target_error.get("details"),
                )
            if exit_code != 0:
                raise ProjectControlError(
                    "CONTROL_ENTRY_FAILED",
                    f"The target project control entry exited with code {exit_code}.",
                    {"stderr": stderr.decode("utf-8", errors="replace")[:_ERROR_DETAIL_LIMIT]},
                )
            result = decoded["result"]
            if not isinstance(result, dict):
                raise ProjectControlError(
                    "CONTROL_PROTOCOL_INCOMPATIBLE",
                    "The target project control result must be an object.",
                )
            failed = False
            return result
        finally:
            self.metrics.record(
                operation,
                round((time.monotonic() - started_at) * 1_000),
                failed,
            )

    def _ensure_fixed_runtime(self) -> None:
        if not self.entry_path.is_file():
            raise ProjectControlError(
                "CONTROL_ENTRY_MISSING",
                f"Target project control entry is missing: {PROJECT_CONTROL_ENTRY_PATH}.",
            )
        if not self.executable_path.is_file():
            raise ProjectControlError(
                "CONTROL_RUNTIME_MISSING",
                "Target project dependencies are not installed; node_modules/.bin/tsx is unavailable.",
            )

    def _validate_protocol(self, value: Any, *, request: bool) -> None:
        if not isinstance(value, dict) or value.get("schemaVersion") != PROJECT_CONTROL_SCHEMA_VERSION:
            raise ProjectControlError(
                "CONTROL_PROTOCOL_INCOMPATIBLE",
                f"The target project control {'request' if request else 'response'} is incompatible with schema version {PROJECT_CONTROL_SCHEMA_VERSION}.",
            )
        definition = "request" if request else "response"
        schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": self._validator.schema["$defs"],
            "$ref": f"#/$defs/{definition}",
        }
        try:
            self._validator.evolve(schema=schema).validate(value)
        except ValidationError as error:
            raise ProjectControlError(
                "CONTROL_PROTOCOL_INCOMPATIBLE",
                f"The target project control {definition} is incompatible with schema version {PROJECT_CONTROL_SCHEMA_VERSION}.",
                {"cause": error.message},
            ) from error

    async def _execute(self, payload: bytes) -> tuple[bytes, bytes, int]:
        try:
            process = await asyncio.create_subprocess_exec(
                str(self.executable_path),
                str(self.entry_path),
                cwd=self.project_root,
                env={
                    "CI": "1",
                    "FORCE_COLOR": "0",
                    "PATH": os.environ.get("PATH", ""),
                },
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            raise ProjectControlError(
                "CONTROL_ENTRY_SPAWN_FAILED", str(error)
            ) from error

        output_bytes = 0
        output_lock = asyncio.Lock()

        async def read_stream(stream: asyncio.StreamReader | None) -> bytes:
            nonlocal output_bytes
            if stream is None:
                return b""
            chunks: list[bytes] = []
            while chunk := await stream.read(64 * 1024):
                async with output_lock:
                    output_bytes += len(chunk)
                    if output_bytes > self.max_output_bytes:
                        raise _OutputLimitExceeded
                chunks.append(chunk)
            return b"".join(chunks)

        stdout_task = asyncio.create_task(read_stream(process.stdout))
        stderr_task = asyncio.create_task(read_stream(process.stderr))
        wait_task = asyncio.create_task(process.wait())
        tasks = (stdout_task, stderr_task, wait_task)
        try:
            if process.stdin is None:
                raise OSError("ProjectControl stdin pipe is unavailable.")
            process.stdin.write(payload)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()
            stdout, stderr, exit_code = await asyncio.wait_for(
                asyncio.gather(*tasks), timeout=self.timeout_seconds
            )
            return stdout, stderr, int(exit_code)
        except _OutputLimitExceeded as error:
            await self._terminate(process)
            raise ProjectControlError(
                "CONTROL_OUTPUT_TOO_LARGE",
                f"Target project control output exceeds {self.max_output_bytes} bytes.",
            ) from error
        except TimeoutError as error:
            await self._terminate(process)
            raise ProjectControlError(
                "CONTROL_ENTRY_TIMEOUT",
                f"Target project control entry timed out after {self.timeout_seconds:g}s.",
            ) from error
        except (BrokenPipeError, ConnectionResetError, OSError) as error:
            await self._terminate(process)
            raise ProjectControlError(
                "CONTROL_ENTRY_SPAWN_FAILED", str(error)
            ) from error
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    @staticmethod
    async def _terminate(process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=_TERMINATE_TIMEOUT_SECONDS)
        except TimeoutError:
            process.kill()
            await asyncio.wait_for(process.wait(), timeout=_TERMINATE_TIMEOUT_SECONDS)
