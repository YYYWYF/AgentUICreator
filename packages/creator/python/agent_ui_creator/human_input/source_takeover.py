"""Host-bound source takeover questions; observations never authorize mutation."""
import json
from dataclasses import dataclass
from typing import Any
from .models import QuestionRequest, QuestionAnswers
from .plugin_source_messages import MESSAGES
from ..operator import OperatorError


def takeover_question(plugin_id: str, plan_hash: str, locale: str = "zh-CN") -> QuestionRequest:
    messages = MESSAGES[locale]
    return QuestionRequest.model_validate({"steps": [{
        "id": "plugin-source-" + plan_hash,
        "question": messages["question"].format(plugin_id=plugin_id),
        "description": messages["description"],
        "options": [{"id": "approve", "label": messages["approve"]},
                    {"id": "decline", "label": messages["decline"]}],
        "selectionMode": "single", "minSelections": 1, "maxSelections": 1,
    }]})


@dataclass(frozen=True)
class SourceTakeoverConfirmation:
    plugin_id: str
    plan_hash: str
    plan_json: str | None = None

    @classmethod
    def from_plan(cls, plan: dict[str, Any]) -> "SourceTakeoverConfirmation":
        return cls(plan["pluginId"], plan["planHash"], json.dumps(plan, ensure_ascii=False, indent=2))

    def request(self) -> QuestionRequest:
        request = takeover_question(self.plugin_id, self.plan_hash)
        if self.plan_json is not None:
            request.steps[0].description += "\n\n```json\n" + self.plan_json + "\n```"
        return request

    def result_text(self, result: dict[str, Any]) -> str:
        messages = MESSAGES["zh-CN"]
        if result.get("status") == "declined":
            return messages["declined"].format(plugin_id=self.plugin_id)
        return messages["completed"].format(plugin_id=self.plugin_id) + "\n" + messages["verification"].format(checks=", ".join(result.get("checks", [])))

    async def execute(self, client: Any, answers: dict[str, Any], activity: Any = None) -> dict[str, Any]:
        validated = QuestionAnswers.model_validate(answers).validate_for(self.request())
        if validated.answers["plugin-source-" + self.plan_hash] != ["approve"]:
            return {"pluginId": self.plugin_id, "status": "declined", "changedPaths": []}
        plan = await client.plan_plugin_source_takeover(self.plugin_id)
        if plan.get("planHash") != self.plan_hash:
            raise OperatorError("PLUGIN_SOURCE_PLAN_STALE", "Source takeover plan changed; inspect and confirm a new plan.")
        if activity is not None:
            from ..project_paths import agent_ui_source_path
            paths = [*plan["files"], *[f"plugins/{self.plugin_id}/{name}" for name in plan.get("applicationChanges", [])], "plugins/registry.generated.ts"]
            for path in paths:
                activity.capture_before(agent_ui_source_path(activity.project_root, path))
            activity.capture_before("/.agent-ui/plugin-ownership.json")
        result = await client.takeover_plugin_source(self.plugin_id, self.plan_hash)
        if activity is not None:
            for changed_path in result.get("changedPaths", []):
                activity.file_observations.observe(changed_path)
                activity.touch(changed_path)
        return result
