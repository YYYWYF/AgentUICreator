from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
from pathlib import Path
from typing import Any, Literal

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

from ..contract_resources import read_creator_contract
from ..run_cancellation import assert_run_writable, current_cancel_marker

from .errors import ProjectControlError
from .models import (
    MAX_PROJECT_CONTROL_OUTPUT_BYTES,
    PROJECT_CONTROL_ENTRY_PATH,
    PROJECT_CONTROL_TIMEOUT_SECONDS,
    ProjectControlMetrics,
    ProjectControlOperation,
)

_ERROR_DETAIL_LIMIT = 2_000
_TERMINATE_TIMEOUT_SECONDS = 1.0


def _load_protocol_validator() -> Draft202012Validator:
    schemas = [read_creator_contract(name) for name in (
        "project-control.schema.json",
        "app-ui-model-operation.schema.json",
    )]
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
        node_executable: str | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self._node_executable = node_executable or os.environ.get("CREATOR_NODE_EXECUTABLE") or shutil.which("node")
        self.entry_path = self.project_root / PROJECT_CONTROL_ENTRY_PATH
        self.executable_path = Path(self._node_executable) if self._node_executable else self.entry_path
        self.metrics = ProjectControlMetrics()
        self._validator = _load_protocol_validator()
        self._result_defs = {
            entry["name"]: entry["resultDef"]
            for entry in read_creator_contract("project-control.operations.json")["operations"]
        }

    async def inspect_ui_project(
        self, *, view: Literal["composition"] | None = None
    ) -> dict[str, Any]:
        input = {} if view is None else {"view": view}
        return await self._request("inspect_ui_project", input)

    async def inspect_app_ui_model(self) -> dict[str, Any]:
        return await self._request("inspect_app_ui_model", {})

    async def list_ui_plugins(self) -> dict[str, Any]:
        return await self._request("list_ui_plugins", {})

    async def inspect_ui_slots(
        self,
        *,
        target: dict[str, Any] | None = None,
        app_ui_model_hash: str | None = None,
    ) -> dict[str, Any]:
        input: dict[str, Any] = {}
        if target is not None:
            input["target"] = target
        if app_ui_model_hash is not None:
            input["appUIModelHash"] = app_ui_model_hash
        return await self._request(
            "inspect_ui_slots", input
        )

    async def inspect_ui_plugin(self, plugin_id: str) -> dict[str, Any]:
        return await self._request("inspect_ui_plugin", {"pluginId": plugin_id})

    async def preflight_ui_plugin_placement(
        self, *, app_ui_model_hash: str, capability_catalog_revision: str,
        instance_id: str, manifest: dict[str, Any],
    ) -> dict[str, Any]:
        return await self._request("preflight_ui_plugin_placement", {
            "appUIModelHash": app_ui_model_hash,
            "capabilityCatalogRevision": capability_catalog_revision,
            "instanceId": instance_id,
            "manifest": manifest,
        })

    async def inspect_ui_services(self) -> dict[str, Any]:
        return await self._request("inspect_ui_services", {})

    async def inspect_ui_plugin_source_references(
        self, plugin_id: str
    ) -> dict[str, Any]:
        return await self._request(
            "inspect_ui_plugin_source_references", {"pluginId": plugin_id}
        )

    async def verify_runtime_composition(
        self, *, app_ui_model_hash: str, composition: dict[str, Any]
    ) -> dict[str, Any]:
        """Internal transport for Host-owned Runtime composition verification."""
        return await self._request(
            "verify_runtime_composition",
            {
                "appUIModelHash": app_ui_model_hash,
                "composition": composition,
            },
        )

    async def verify_ui_project(self) -> dict[str, Any]:
        """Run the target Host's deterministic UI verification through its API."""
        return await self._request("verify_ui_project", {})

    async def inspect_agent_ui_sources(self) -> dict[str, Any]:
        return await self._request("inspect_agent_ui_sources", {})

    async def apply_agent_ui_source_item(
        self, *, item_id: str, expected_state_hash: str
    ) -> dict[str, Any]:
        return await self._request(
            "apply_agent_ui_source_item",
            {"itemId": item_id, "expectedStateHash": expected_state_hash},
        )

    async def remove_agent_ui_source_items(
        self, *, item_ids: list[str], expected_state_hash: str
    ) -> dict[str, Any]:
        """Internal Host capability; deliberately not exposed as an Agent Tool."""
        return await self._request(
            "remove_agent_ui_source_items",
            {"itemIds": item_ids, "expectedStateHash": expected_state_hash},
        )

    async def request_app_ui_model_mutation(
        self, input: dict[str, Any]
    ) -> dict[str, Any]:
        """Internal transport used only by AppUIModelMutationService."""
        return await self._request("mutate_app_ui_model", input)

    async def synchronize_plugin_registry(
        self, *, expected_source_hash: str
    ) -> dict[str, Any]:
        """Internal Host operation for registry changes caused by Plugin declarations."""
        return await self._request(
            "synchronize_plugin_registry",
            {"expectedSourceHash": expected_source_hash},
        )

    async def _request(
        self,
        operation: ProjectControlOperation,
        input: dict[str, Any],
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        failed = True
        try:
            self._ensure_fixed_runtime()
            if operation in {"mutate_app_ui_model", "apply_agent_ui_source_item",
                             "remove_agent_ui_source_items", "synchronize_plugin_registry"}:
                assert_run_writable()
                marker = current_cancel_marker(self.project_root)
                if marker is not None:
                    input = {**input, "cancelMarker": marker}
            request = {
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
            try:
                self._validate_protocol(decoded, request=False)
            except ProjectControlError as error:
                raise ProjectControlError(error.code, str(error), {"operation": operation, "cause": str((error.details or {}).get("cause", str(error)))[:_ERROR_DETAIL_LIMIT]}) from error
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
            self._validate_result(operation, result)
            failed = False
            return result
        finally:
            self.metrics.record(
                operation,
                round((time.monotonic() - started_at) * 1_000),
                failed,
            )

    def _ensure_fixed_runtime(self) -> None:
        managed = self.project_root / PROJECT_CONTROL_ENTRY_PATH
        if not managed.is_file():
            raise ProjectControlError("CONTROL_ENTRY_MISSING", f"Missing {PROJECT_CONTROL_ENTRY_PATH}.")
        self.entry_path = managed
        if not self._node_executable:
            raise ProjectControlError("CONTROL_RUNTIME_MISSING", "Creator Node runtime is unavailable.")
        self.executable_path = Path(self._node_executable)
        if not self.executable_path.is_file():
            raise ProjectControlError("CONTROL_RUNTIME_MISSING", f"Project control runtime is unavailable: {self.executable_path}.")

    def _validate_protocol(self, value: Any, *, request: bool) -> None:
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
                f"ProjectControl {definition} does not match the current contract.",
                {"cause": error.message},
            ) from error

    def _validate_result(self, operation: ProjectControlOperation, value: Any) -> None:
        try:
            definition = self._result_defs[operation]
            self._validator.evolve(schema={
                "$schema": self._validator.schema["$schema"],
                "$id": self._validator.schema["$id"],
                "$defs": self._validator.schema["$defs"],
                "$ref": f"#/$defs/{definition}",
            }).validate(value)
        except (ValidationError, KeyError) as error:
            cause = error.message if isinstance(error, ValidationError) else "Unknown operation."
            raise ProjectControlError(
                "CONTROL_PROTOCOL_INCOMPATIBLE",
                "ProjectControl result does not match the current operation contract.",
                {"operation": operation, "cause": cause[:_ERROR_DETAIL_LIMIT]},
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
