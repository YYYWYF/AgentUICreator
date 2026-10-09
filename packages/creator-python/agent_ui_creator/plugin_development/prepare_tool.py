from __future__ import annotations

import json
from typing import Any, Literal

from langchain_core.tools import BaseTool, tool
from langgraph.types import interrupt
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..human_input.models import QuestionRequest
from .delivery import PluginAuthoringContract
from .authority import PluginDevelopmentAuthority, PluginDevelopmentError


DEVELOPMENT_DECISION_STEP_ID = "plugin-development-decision"
DEVELOPMENT_DECISION_OPTIONS = frozenset({"start", "adjust", "defer"})


class PrepareUIPluginDevelopmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    deliveryContract: PluginAuthoringContract
    workKind: Literal["create-plugin", "adapt-component", "extend-capability"] = Field(
        default="create-plugin", description=(
            "create-plugin and adapt-component create a NEW Plugin identity. "
            "For new behavior or unfinished development in an EXISTING Plugin, use "
            "extend-capability with its current id; never recreate that directory. "
            "Ordinary existing Plugin customization or composition alone does not "
            "require a new development proposal."
        ),
    )
    targetPluginId: str = Field(min_length=1, max_length=100)
    desiredOutcome: str = Field(min_length=1, max_length=1200)
    missingCapabilities: list[str] = Field(min_length=1, max_length=12)
    reuseEvidenceRefs: list[str] = Field(default_factory=list, max_length=24, description=(
        "Existing Plugin / Source Item reuse investigation conclusions. These are not "
        "Host UI component source evidence and cannot replace componentBasisRefs."
    ))
    uiScope: str = Field(default="", max_length=500, description=(
        "UI business scope and selected UI system: cite actual source usage, controls "
        "and import origins, Provider/theme conventions, and why other discovered "
        "systems were not selected. Generated imports must match this plan."
    ))
    dataScope: str = Field(default="", max_length=500)
    excludedOperations: list[str] = Field(default_factory=list, max_length=12)
    componentBasisRefs: list[str] = Field(default_factory=list, max_length=12, description=(
        "Required by Host for new panel / semantic-slot Plugins. Array of real file "
        "paths already inspected, including the Host page/component usage entry and "
        "relevant component exports, Provider or theme files. Paths only, no descriptive "
        "strings or invented files. Bind selection evidence that remains unchanged; do not "
        "include locale authoring files or new Plugin files you intend to edit. "
        "Separate from reuseEvidenceRefs. On rejection, "
        "read the error, inspect missing evidence and resubmit this tool with valid paths. "
        "Other development types may omit this field."
    ))

    @model_validator(mode="before")
    @classmethod
    def normalize_plan_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict) or not isinstance(value.get("deliveryContract"), dict):
            return value
        normalized = dict(value)
        contract = dict(normalized["deliveryContract"])
        for field_name in (
            "workKind", "targetPluginId", "desiredOutcome", "missingCapabilities",
            "reuseEvidenceRefs", "uiScope", "dataScope", "excludedOperations",
            "componentBasisRefs",
        ):
            if field_name not in contract:
                continue
            nested_value = contract.pop(field_name)
            if field_name in normalized and normalized[field_name] != nested_value:
                raise ValueError(f"Conflicting {field_name} values in development plan")
            normalized.setdefault(field_name, nested_value)
        if "desiredOutcome" not in normalized and isinstance(contract.get("capability"), str):
            normalized["desiredOutcome"] = contract["capability"]
        normalized["deliveryContract"] = contract
        return normalized


def is_development_decision_question(metadata: dict[str, Any]) -> bool:
    steps = metadata.get("steps")
    return (
        isinstance(steps, list) and len(steps) == 1
        and isinstance(steps[0], dict)
        and steps[0].get("id") == DEVELOPMENT_DECISION_STEP_ID
        and {option.get("id") for option in steps[0].get("options", [])
             if isinstance(option, dict)} == DEVELOPMENT_DECISION_OPTIONS
    )


def create_prepare_ui_plugin_development_tool(
    authority: PluginDevelopmentAuthority,
) -> BaseTool:
    @tool(
        "prepare_ui_plugin_development",
        args_schema=PrepareUIPluginDevelopmentInput,
        description=(
            "Fix a bounded UI Plugin development plan before implementing a new Plugin "
            "or new business behavior. The Host checks the current user request and "
            "discovery state; this tool never writes target project source. Direct or "
            "satisfied conditional development commissions proceed without a second "
            "approval. Otherwise it asks the user to start, adjust, or defer. Call "
            "this tool alone, after checking existing Plugins and Source Items. Do "
            "not pass approval, grant, caller, or permission fields."
        ),
    )
    def prepare_ui_plugin_development(
        workKind: str, targetPluginId: str, desiredOutcome: str,
        deliveryContract: dict,
        missingCapabilities: list[str], reuseEvidenceRefs: list[str] | None = None,
        uiScope: str = "", dataScope: str = "",
        excludedOperations: list[str] | None = None,
        componentBasisRefs: list[str] | None = None,
    ) -> str:
        try:
            result = authority.prepare(
                delivery_contract=deliveryContract,
                work_kind=workKind,
                target_plugin_id=targetPluginId,
                desired_outcome=desiredOutcome,
                missing_capabilities=missingCapabilities,
                reuse_evidence_refs=reuseEvidenceRefs or [],
                ui_scope=uiScope,
                data_scope=dataScope,
                excluded_operations=excludedOperations or [],
                component_basis_refs=componentBasisRefs or [],
            )
            if result["status"] == "pending":
                gap = "、".join(missingCapabilities)
                exclusions = "、".join(excludedOperations or []) or "未获授权的后端、Service 和 Agent 操作"
                question = QuestionRequest.model_validate({
                    "steps": [{
                        "id": DEVELOPMENT_DECISION_STEP_ID,
                        "question": f"现有能力不能直接完成：{gap}。是否按此方案开发？",
                        "description": (
                            f"目标：{desiredOutcome}。拟创建：{targetPluginId}；"
                            f"界面范围：{uiScope or '所述前端交互'}；"
                            f"数据范围：{dataScope or '以用户请求为准'}；"
                            f"不包括：{exclusions}。"
                            f"交付契约：{json.dumps(result.get('deliveryContract'), ensure_ascii=False)}。"
                        ),
                        "options": [
                            {"id": "start", "label": "开始开发", "description": "仅批准显示的开发范围。"},
                            {"id": "adjust", "label": "调整需求", "description": "结束当前方案，重新说明目标。"},
                            {"id": "defer", "label": "暂不处理", "description": "本次不开发，也不改动目标工程。"},
                        ],
                        "selectionMode": "single", "minSelections": 1, "maxSelections": 1,
                    }],
                }).model_dump(mode="json", exclude_none=True)
                authority.register_decision_question(str(result["proposalId"]), question)
                interrupt({"kind": "ask_user_question", **question})
            return json.dumps({"ok": True, "result": result}, ensure_ascii=False)
        except PluginDevelopmentError as error:
            return json.dumps({
                "ok": False, "error": {"code": error.code, "message": str(error)},
            }, ensure_ascii=False)

    return prepare_ui_plugin_development
