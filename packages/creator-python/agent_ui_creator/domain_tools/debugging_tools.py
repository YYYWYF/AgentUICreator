from __future__ import annotations

import json
from typing import Any

from langchain_core.tools import BaseTool, tool

from ..runtime_diagnostics import RuntimeDiagnosticInspectionService
from ..validation import CreatorValidationService


def create_debugging_target_tools(
    validation: CreatorValidationService, runtime: RuntimeDiagnosticInspectionService,
) -> list[BaseTool]:
    def failure(code: str) -> str:
        return json.dumps({"ok": False, "error": {"code": code},
                           "nextAction": "inspect_current_diagnostics_or_ask_user"})

    def runtime_baseline() -> tuple[dict[str, Any] | None, str | None]:
        debugging = validation.debugging
        if debugging.runtime_baseline is None and validation.activity.revision != 0:
            return None, "DEBUGGING_BASELINE_REQUIRED"
        current = runtime.current_result()
        if current is None:
            return None, "DEBUGGING_EVIDENCE_STALE"
        identities = debugging.runtime_identities(current)
        if identities is None:
            return None, "DEBUGGING_EVIDENCE_INCOMPLETE"
        return identities, None

    @tool("select_debugging_target")
    async def select_debugging_target(target_id: str) -> str:
        """Select one debuggingTargetId already observed in this run for the error the user authorized repairing. If multiple diagnostics remain plausible, ask_user_question first. Selection grants no write permission or scope expansion."""
        validation._synchronize_run_state()
        debugging = validation.debugging
        debugging.target_selection_calls += 1
        observed = debugging.observed_targets.get(target_id)
        if observed is None:
            return failure("DEBUGGING_TARGET_NOT_OBSERVED")
        if observed["kind"] == "static":
            current = validation.current_result()
            differential = None if current is None else current.differential
            if (current is None or current.status == "stale" or differential is None
                    or not differential.current_available):
                return failure("DEBUGGING_EVIDENCE_STALE")
            key = target_id.removeprefix("ts:")
            diagnostic = next((item for item in differential.current_diagnostics
                               if debugging.static_key(item) == key), None)
            if diagnostic is None:
                return failure("DEBUGGING_EVIDENCE_STALE")
            debugging.targets[key] = {**debugging.static_identity(diagnostic),
                                      "revision": current.revision}
        else:
            identities, error = runtime_baseline()
            if error:
                return failure(error)
            assert identities is not None
            key = target_id.removeprefix("runtime:")
            if key not in identities:
                return failure("DEBUGGING_EVIDENCE_STALE")
            if debugging.runtime_baseline is None:
                debugging.runtime_baseline = dict(identities)
            debugging.runtime_targets[key] = identities[key]
        debugging.selected_target_ids.add(target_id)
        return json.dumps({"ok": True, "result": {
            "status": "selected", "targetId": target_id, "kind": observed["kind"],
            "owner": observed["owner"], "nextAction": "inspect_owner_before_repair",
        }})

    @tool("select_all_current_runtime_diagnostics")
    async def select_all_current_runtime_diagnostics() -> str:
        """Select all currently observed Runtime diagnostics only when the user explicitly requests repairing all current errors. Requires complete fresh pre-mutation evidence. Each write still obeys Scope Guard, owner, layer and development authority."""
        validation._synchronize_run_state()
        debugging = validation.debugging
        debugging.target_selection_calls += 1
        identities, error = runtime_baseline()
        if error:
            return failure(error)
        assert identities is not None
        target_ids = {"runtime:" + key for key in identities}
        if not target_ids or not target_ids.issubset(debugging.observed_targets):
            return failure("DEBUGGING_TARGET_NOT_OBSERVED")
        if debugging.runtime_baseline is None:
            debugging.runtime_baseline = dict(identities)
        debugging.runtime_targets.update(identities)
        debugging.selected_target_ids.update(target_ids)
        debugging.all_current_runtime = True
        return json.dumps({"ok": True, "result": {
            "status": "selected", "scope": "all_current_runtime",
            "targetCount": len(target_ids), "nextAction": "inspect_owner_before_repair",
        }})

    return [select_debugging_target, select_all_current_runtime_diagnostics]
