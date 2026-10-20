from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import weakref
from pathlib import Path
from typing import Any, Literal

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError
from referencing import Registry, Resource

from ..contract_resources import read_creator_contract
from ..removal_intent import assert_current_removal_mutation
from ..run_cancellation import assert_run_writable, current_cancel_marker

from .errors import OperatorError
from .models import (
    MAX_OPERATOR_OUTPUT_BYTES,
    OPERATOR_ENTRY_PATH,
    OPERATOR_TIMEOUT_SECONDS,
    OperatorMetrics,
    OperatorOperation,
)

_ERROR_DETAIL_LIMIT = 2_000
_TERMINATE_TIMEOUT_SECONDS = 1.0
# Separate loops must not share asyncio primitives. All clients in one server
# loop share admission by canonical project, rather than by agent/client object.
_PROJECT_GATES: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


def _project_gate(root: Path) -> asyncio.Lock:
    gates = _PROJECT_GATES.setdefault(asyncio.get_running_loop(), {})
    return gates.setdefault(os.path.normcase(str(root)), asyncio.Lock())



def _load_protocol_validator() -> Draft202012Validator:
    schemas = [read_creator_contract(name) for name in (
        "operator.schema.json",
        "app-ui-model-operation.schema.json",
    )]
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas
    )
    return Draft202012Validator(schemas[0], registry=registry)


class _OutputLimitExceeded(Exception):
    pass


class OperatorClient:
    """JSON protocol transport for the target project's fixed Operator entry."""

    def __init__(
        self,
        *,
        project_root: Path,
        timeout_seconds: float = OPERATOR_TIMEOUT_SECONDS,
        max_output_bytes: int = MAX_OPERATOR_OUTPUT_BYTES,
        node_executable: str | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.timeout_seconds = timeout_seconds
        self.max_output_bytes = max_output_bytes
        self._node_executable = node_executable or os.environ.get("CREATOR_NODE_EXECUTABLE") or shutil.which("node")
        self.entry_path = self.project_root / OPERATOR_ENTRY_PATH
        self.executable_path = Path(self._node_executable) if self._node_executable else self.entry_path
        self.metrics = OperatorMetrics()
        self._validator = _load_protocol_validator()
        self._result_defs = {
            entry["name"]: entry["resultDef"]
            for entry in read_creator_contract("operator.operations.json")["operations"]
        }

    async def plan_agent_ui_integration(self, options: dict[str, Any]) -> dict[str, Any]:
        return await self._request("plan_agent_ui_integration", options)

    async def apply_agent_ui_integration(self, recipe: dict[str, Any]) -> dict[str, Any]:
        return await self._request("apply_agent_ui_integration", {"recipe": recipe})

    async def prepare_agent_ui_integration_asset(self, recipe: dict[str, Any]) -> dict[str, Any]:
        return await self._request("prepare_agent_ui_integration_asset", {"recipe": recipe})

    async def verify_agent_ui_integration(self, recipe: dict[str, Any]) -> dict[str, Any]:
        return await self._request("verify_agent_ui_integration", {"recipe": recipe})

    async def inspect_ui_project(
        self, *, view: Literal["composition"] | None = None
    ) -> dict[str, Any]:
        input = {} if view is None else {"view": view}
        return await self._request("inspect_ui_project", input)

    async def inspect_app_ui_model(self) -> dict[str, Any]:
        return await self._request("inspect_app_ui_model", {})

    async def inspect_app_ui_model_source(self) -> dict[str, Any]:
        return await self._request("inspect_app_ui_model_source", {})

    async def repair_app_ui_model(self, *, expected_raw_hash: str, candidate_model: dict[str, Any]) -> dict[str, Any]:
        return await self._request("repair_app_ui_model", {"expectedRawHash": expected_raw_hash, "candidateModel": candidate_model})

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

    async def inspect_ui_plugin(self, plugin_id: str, shared_symbols: list[str] | None = None, shared_module: str | None = None) -> dict[str, Any]:
        return await self._request("inspect_ui_plugin", {"pluginId": plugin_id, **({"sharedSymbols": shared_symbols} if shared_symbols else {}), **({"sharedModule": shared_module} if shared_module else {})})

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

    async def plan_plugin_source_takeover(self, plugin_id: str) -> dict[str, Any]:
        return await self._request("plan_plugin_source_takeover", {"pluginId": plugin_id})

    async def takeover_plugin_source(self, plugin_id: str, plan_hash: str) -> dict[str, Any]:
        return await self._request("takeover_plugin_source", {"pluginId": plugin_id, "planHash": plan_hash})

    async def create_custom_plugin(self, **input: Any) -> dict[str, Any]:
        return await self._request("create_custom_plugin", input)

    async def purge_ui_plugin(self, *, plugin_id: str, app_ui_model_hash: str,
                              source_state_hash: str) -> dict[str, Any]:
        return await self._request("purge_ui_plugin", {
            "pluginId": plugin_id, "appUIModelHash": app_ui_model_hash,
            "sourceStateHash": source_state_hash,
        })

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

    async def _request(self, operation: OperatorOperation, input: dict[str, Any]) -> dict[str, Any]:
        waiting = time.monotonic()
        async with _project_gate(self.project_root):
            self.metrics.queueWaitMs += round((time.monotonic() - waiting) * 1_000)
            # Validate runtime, permissions and cancellation after waiting too.
            return await self._request_admitted(operation, input)

    async def _request_admitted(
        self,
        operation: OperatorOperation,
        input: dict[str, Any],
    ) -> dict[str, Any]:
        started_at = time.monotonic()
        failed = True
        try:
            self._ensure_fixed_runtime()
            if operation in {"apply_agent_ui_integration", "prepare_agent_ui_integration_asset", "repair_app_ui_model", "mutate_app_ui_model", "apply_agent_ui_source_item",
                             "remove_agent_ui_source_items", "synchronize_plugin_registry", "purge_ui_plugin", "create_custom_plugin", "takeover_plugin_source", "migrate_official_package_plugin"}:
                assert_current_removal_mutation(operation, input)
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
                raise OperatorError(
                    "OPERATOR_PROTOCOL_INVALID_JSON",
                    "The target operator entry did not return valid JSON.",
                    {
                        "stdout": stdout.decode("utf-8", errors="replace")[:_ERROR_DETAIL_LIMIT],
                        "stderr": stderr.decode("utf-8", errors="replace")[:_ERROR_DETAIL_LIMIT],
                        "cause": str(error),
                    },
                ) from error
            try:
                self._validate_protocol(decoded, request=False)
            except OperatorError as error:
                raise OperatorError(error.code, str(error), {"operation": operation, "cause": str((error.details or {}).get("cause", str(error)))[:_ERROR_DETAIL_LIMIT]}) from error
            if not decoded["ok"]:
                target_error = decoded["error"]
                raise OperatorError(
                    target_error["code"],
                    target_error["message"],
                    target_error.get("details"),
                )
            if exit_code != 0:
                raise OperatorError(
                    "OPERATOR_ENTRY_FAILED",
                    f"The target operator entry exited with code {exit_code}.",
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
        managed = self.project_root / OPERATOR_ENTRY_PATH
        if not managed.is_file():
            raise OperatorError("OPERATOR_ENTRY_MISSING", f"Missing {OPERATOR_ENTRY_PATH}.")
        self.entry_path = managed
        if not self._node_executable:
            raise OperatorError("OPERATOR_RUNTIME_MISSING", "Creator Node runtime is unavailable.")
        self.executable_path = Path(self._node_executable)
        if not self.executable_path.is_file():
            raise OperatorError("OPERATOR_RUNTIME_MISSING", f"Operator runtime is unavailable: {self.executable_path}.")

    def _validate_protocol(self, value: Any, *, request: bool) -> None:
        definition = "request" if request else "response"
        schema = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": self._validator.schema["$defs"],
            "$ref": f"#/$defs/{definition}",
        }
        # Validate a known operation's exact branch first so input failures name
        # the field instead of returning the entire request's oneOf failure.
        if request and isinstance(value, dict):
            branch = next((item for item in self._validator.schema["$defs"]["request"].get("oneOf", [])
                           if item.get("properties", {}).get("operation", {}).get("const") == value.get("operation")), None)
            if branch is not None:
                schema = {**schema, "$ref": None, **branch}
                schema.pop("$ref", None)
        try:
            self._validator.evolve(schema=schema).validate(value)
        except ValidationError as error:
            raise OperatorError(
                "OPERATOR_PROTOCOL_INCOMPATIBLE",
                f"Operator {definition} does not match the current contract.",
                {"field": ".".join(str(part) for part in error.absolute_path),
                 "constraint": str(error.validator),
                 "cause": error.message[:_ERROR_DETAIL_LIMIT]},
            ) from error

    def _validate_result(self, operation: OperatorOperation, value: Any) -> None:
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
            raise OperatorError(
                "OPERATOR_PROTOCOL_INCOMPATIBLE",
                "Operator result does not match the current operation contract.",
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
            raise OperatorError(
                "OPERATOR_ENTRY_SPAWN_FAILED", str(error)
            ) from error

        output_bytes = 0
        output_lock = asyncio.Lock()
        admitted = asyncio.Event()
        admission_tail = b""

        async def read_stream(stream: asyncio.StreamReader | None) -> bytes:
            nonlocal output_bytes, admission_tail
            if stream is None:
                return b""
            chunks: list[bytes] = []
            while chunk := await stream.read(64 * 1024):
                async with output_lock:
                    output_bytes += len(chunk)
                    if output_bytes > self.max_output_bytes:
                        raise _OutputLimitExceeded
                if stream is process.stderr:
                    admission_tail = (admission_tail + chunk)[-256:]
                    if b"AGENT_UI_OPERATOR_ADMITTED\n" in admission_tail:
                        admitted.set()
                chunks.append(chunk)
            return b"".join(chunks)

        stdout_task = asyncio.create_task(read_stream(process.stdout))
        stderr_task = asyncio.create_task(read_stream(process.stderr))
        wait_task = asyncio.create_task(process.wait())
        tasks = (stdout_task, stderr_task, wait_task)
        phase = "admission"
        transport_started = time.monotonic()
        execution_started: float | None = None
        try:
            if process.stdin is None:
                raise OSError("Operator stdin pipe is unavailable.")
            process.stdin.write(payload)
            await process.stdin.drain()
            process.stdin.close()
            await process.stdin.wait_closed()
            completion = asyncio.gather(*tasks)
            admission_task = asyncio.create_task(admitted.wait())
            phase = "admission"
            try:
                done, _ = await asyncio.wait(
                    {completion, admission_task}, timeout=self.timeout_seconds,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    raise TimeoutError
                # Older entries without admission telemetry remain supported:
                # completion wins, while a hung older entry times out above.
                if admitted.is_set():
                    phase = "execution"
                    execution_started = time.monotonic()
                    self.metrics.admissionWaitMs += round((execution_started - transport_started) * 1_000)
                budget = max(self.timeout_seconds, 300) if json.loads(payload).get("operation") in {"create_custom_plugin", "takeover_plugin_source"} else self.timeout_seconds
                stdout, stderr, exit_code = await asyncio.wait_for(completion, timeout=budget)
            finally:
                admission_task.cancel()
                await asyncio.gather(admission_task, return_exceptions=True)
                if not completion.done():
                    completion.cancel()
                await asyncio.gather(completion, return_exceptions=True)
            return stdout, stderr, int(exit_code)
        except _OutputLimitExceeded as error:
            await self._terminate(process)
            raise OperatorError(
                "OPERATOR_OUTPUT_TOO_LARGE",
                f"Target operator output exceeds {self.max_output_bytes} bytes.",
            ) from error
        except asyncio.CancelledError:
            await self._terminate(process)
            raise
        except TimeoutError as error:
            await self._terminate(process)
            raise OperatorError(
                "OPERATOR_ENTRY_TIMEOUT",
                f"Target operator {phase} timed out after {self.timeout_seconds:g}s.",
            ) from error
        except (BrokenPipeError, ConnectionResetError, OSError) as error:
            await self._terminate(process)
            raise OperatorError(
                "OPERATOR_ENTRY_SPAWN_FAILED", str(error)
            ) from error
        finally:
            if execution_started is not None:
                self.metrics.executionMs += round((time.monotonic() - execution_started) * 1_000)
            else:
                self.metrics.admissionWaitMs += round((time.monotonic() - transport_started) * 1_000)
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if process.returncode is not None:
                self._release_child_tickets(process.pid)

    def _release_child_tickets(self, pid: int) -> None:
        directory = self.project_root / ".agent-ui" / "creator" / "control" / "operator-locks"
        if directory.is_symlink() or not directory.is_dir():
            return
        if not directory.resolve().is_relative_to(self.project_root):
            return
        for ticket in directory.glob(f"{pid}.*.json"):
            if ticket.is_symlink():
                continue
            try:
                record = json.loads(ticket.read_text())
                if record.get("pid") == pid and ticket.name == f"{pid}.{record.get('token')}.json":
                    ticket.unlink(missing_ok=True)
            except (FileNotFoundError, ValueError):
                continue


    @staticmethod
    async def _terminate(process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        try:
            process.terminate()
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(process.wait(), timeout=_TERMINATE_TIMEOUT_SECONDS)
        except TimeoutError:
            process.kill()
            await asyncio.wait_for(process.wait(), timeout=_TERMINATE_TIMEOUT_SECONDS)
