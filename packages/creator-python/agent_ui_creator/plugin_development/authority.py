from __future__ import annotations

import hashlib
import json
import re
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal
from uuid import uuid4

from ..project_paths import agent_ui_source_path
from .commission import explicitly_commissions_plugin_development


DevelopmentIntent = Literal["none", "needs_decision", "explicit", "conditional", "prohibited"]
WorkKind = Literal["create-plugin", "adapt-component", "extend-capability"]
ProposalStatus = Literal["pending", "authorized", "adjust", "defer", "superseded", "completed"]
_PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")


class PluginDevelopmentError(ValueError):
    code = "PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED"


@dataclass(frozen=True, slots=True)
class PluginDevelopmentProposal:
    proposal_id: str
    project_key: str
    thread_id: str
    task_id: str
    request_id: str
    work_kind: WorkKind
    target_plugin_id: str
    desired_outcome: str
    missing_capabilities: tuple[str, ...]
    reuse_evidence_refs: tuple[str, ...]
    ui_scope: str
    data_scope: str
    excluded_operations: tuple[str, ...]
    component_basis_refs: tuple[str, ...]
    component_basis_hashes: tuple[tuple[str, str], ...]
    target_fingerprint: str | None
    scope_hash: str
    status: ProposalStatus
    grant_source: Literal["explicit-request", "conditional-request", "proposal-approval"] | None = None
    question_id: str | None = None
    checkpoint_id: str | None = None
    question_fingerprint: str | None = None
    created_plugin_id: str | None = None
    expires_at: float = 0

    def public_result(self) -> dict[str, object]:
        return {
            "status": self.status,
            "proposalId": self.proposal_id,
            "scopeHash": self.scope_hash,
            "workKind": self.work_kind,
            "targetPluginId": self.target_plugin_id,
            "desiredOutcome": self.desired_outcome,
            "missingCapabilities": list(self.missing_capabilities),
            "reuseEvidenceRefs": list(self.reuse_evidence_refs),
            "uiScope": self.ui_scope,
            "dataScope": self.data_scope,
            "excludedOperations": list(self.excluded_operations),
            "componentBasisRefs": list(self.component_basis_refs),
            "grantSource": self.grant_source,
        }


class PluginDevelopmentAuthority:
    """One Host-owned, task-scoped decision state; never serialized into the Agent app.

    The server retains this object across an interrupt and its resume. A new top-level
    user request starts a new task and supersedes the previous task's grant. A sidecar
    restart loses the object, so a stale checkpoint cannot silently confer authority.
    """

    def __init__(
        self, project_root: str | Path, *, thread_id: str,
        skills_root: str | Path | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_key = hashlib.sha256(str(self.project_root).encode()).hexdigest()
        self.thread_id = thread_id
        self.skills_root = Path(skills_root).resolve() if skills_root else (
            Path(__file__).resolve().parents[3] / "creator" / "skills"
        )
        self.task_id: str | None = None
        self.request_id: str | None = None
        self.user_message = ""
        self.blocked_customized_source_plugin_id: str | None = None
        self.intent: DevelopmentIntent = "none"
        self._proposals: dict[str, PluginDevelopmentProposal] = {}
        self._active_proposal_id: str | None = None
        self._plugin_inventory_complete = False
        self._source_inventory_complete = False
        self._matching_existing = False
        self._existing_plugin_ids: set[str] = set()
        self._source_plugin_ids: set[str] = set()
        self._installed_source_plugin_ids: set[str] = set()
        self._loaded_skill_hash: str | None = None

    def begin_task(
        self, *, task_id: str, request_id: str, user_message: str,
        intent: DevelopmentIntent,
    ) -> None:
        if not task_id or not request_id or not user_message.strip():
            raise PluginDevelopmentError("开发授权必须绑定真实的非空用户请求。")
        if intent not in {"none", "needs_decision", "explicit", "conditional", "prohibited"}:
            raise PluginDevelopmentError("未知开发意图。")
        if intent == "explicit" and not explicitly_commissions_plugin_development(user_message):
            intent = "needs_decision"
        for key, proposal in tuple(self._proposals.items()):
            if proposal.status in {"pending", "authorized"}:
                self._proposals[key] = replace(proposal, status="superseded")
        self.task_id = task_id
        self.request_id = request_id
        self.user_message = user_message
        self.blocked_customized_source_plugin_id = None
        self.intent = intent
        self._active_proposal_id = None
        self._plugin_inventory_complete = False
        self._source_inventory_complete = False
        self._matching_existing = False
        self._existing_plugin_ids.clear()
        self._source_plugin_ids.clear()
        self._installed_source_plugin_ids.clear()
        self._loaded_skill_hash = None

    def record_discovery(
        self, *, plugin_inventory_complete: bool = False,
        source_inventory_complete: bool = False,
        matching_existing: bool = False,
        plugin_ids: list[str] | None = None,
        source_plugin_ids: list[str] | None = None,
    ) -> None:
        # Only Host tool-result observers call this method. The model cannot pass
        # a discoveryComplete or matchingExisting flag to prepare().
        self._plugin_inventory_complete |= plugin_inventory_complete
        self._source_inventory_complete |= source_inventory_complete
        self._matching_existing |= matching_existing
        self._existing_plugin_ids.update(plugin_ids or ())
        self._source_plugin_ids.update(source_plugin_ids or ())

    def record_installed_source_plugin(self, plugin_id: str) -> None:
        # A successful Host Source Installer result proves this one Plugin is
        # present without implying that the full Plugin inventory was read.
        if _PLUGIN_ID.fullmatch(plugin_id) is not None:
            self._installed_source_plugin_ids.add(plugin_id)

    def can_compose_existing(self, operations: object) -> bool:
        if not isinstance(operations, list) or not operations:
            return False
        for operation in operations:
            if not isinstance(operation, dict):
                return False
            kind = operation.get("type")
            if kind in {"set_plugin_enabled", "move_plugin"}:
                if not self._plugin_inventory_complete:
                    return False
                continue
            if kind != "insert_plugin":
                return False
            plugin = operation.get("plugin")
            plugin_id = plugin.get("pluginId") if isinstance(plugin, dict) else None
            if (plugin_id not in self._installed_source_plugin_ids
                    and not (self._plugin_inventory_complete
                             and plugin_id in self._existing_plugin_ids)):
                return False
        return True

    @staticmethod
    def _scope_hash(values: dict[str, object]) -> str:
        payload = json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode()).hexdigest()

    def _component_hashes(self, references: list[str]) -> tuple[tuple[str, str], ...]:
        hashes: list[tuple[str, str]] = []
        for reference in references:
            if not isinstance(reference, str) or not reference.strip() or ".." in Path(reference).parts:
                raise PluginDevelopmentError("组件依据路径无效。")
            relative = reference.lstrip("/")
            direct = (self.project_root / relative).resolve()
            managed = (self.project_root / agent_ui_source_path(
                self.project_root, relative
            ).lstrip("/")).resolve()
            target = direct if direct.is_file() else managed
            if not target.is_relative_to(self.project_root) or not target.is_file():
                raise PluginDevelopmentError("适配组件依据不存在于当前工程。")
            hashes.append((target.relative_to(self.project_root).as_posix(),
                           hashlib.sha256(target.read_bytes()).hexdigest()))
        return tuple(hashes)

    @staticmethod
    def _target_fingerprint(root: Path) -> str | None:
        if root.is_symlink():
            raise PluginDevelopmentError("Plugin 源码目录不能是符号链接。")
        if not root.is_dir():
            return None
        digest = hashlib.sha256()
        for path in sorted(root.rglob("*")):
            if path.is_symlink():
                raise PluginDevelopmentError("Plugin 源码包含符号链接，不能固定开发范围。")
            if path.is_file():
                digest.update(path.relative_to(root).as_posix().encode())
                digest.update(b"\0")
                digest.update(hashlib.sha256(path.read_bytes()).digest())
        return digest.hexdigest()

    def _assert_basis_fresh(self, record: PluginDevelopmentProposal) -> None:
        root = self.project_root / agent_ui_source_path(
            self.project_root, f"plugins/{record.target_plugin_id}"
        ).lstrip("/")
        if self._target_fingerprint(root) != record.target_fingerprint:
            raise PluginDevelopmentError("相关 Plugin 源码已变化；必须刷新开发方案。")
        for relative, expected_hash in record.component_basis_hashes:
            target = (self.project_root / relative).resolve()
            if (not target.is_relative_to(self.project_root) or not target.is_file()
                    or hashlib.sha256(target.read_bytes()).hexdigest() != expected_hash):
                raise PluginDevelopmentError("相关组件源码已变化；必须刷新适配方案。")

    def prepare(
        self, *, work_kind: WorkKind, target_plugin_id: str,
        desired_outcome: str, missing_capabilities: list[str],
        reuse_evidence_refs: list[str],
        ui_scope: str = "", data_scope: str = "",
        excluded_operations: list[str] | None = None,
        component_basis_refs: list[str] | None = None,
    ) -> dict[str, object]:
        if self.task_id is None or self.request_id is None:
            raise PluginDevelopmentError("开发方案缺少真实用户任务绑定。")
        if self.intent == "prohibited":
            raise PluginDevelopmentError("用户明确禁止新开发，本任务不能准备开发授权。")
        if work_kind not in {"create-plugin", "adapt-component", "extend-capability"}:
            raise PluginDevelopmentError("未知开发类型。")
        if _PLUGIN_ID.fullmatch(target_plugin_id) is None:
            raise PluginDevelopmentError("开发目标 Plugin ID 无效。")
        target_root = self.project_root / agent_ui_source_path(
            self.project_root, f"plugins/{target_plugin_id}"
        ).lstrip("/")
        if work_kind in {"create-plugin", "adapt-component"} and target_root.exists():
            if self.intent == "conditional":
                return {"status": "reuse-existing", "targetPluginId": target_plugin_id}
            raise PluginDevelopmentError("目标 Plugin 身份已经存在；请复用、修改或选择新身份。")
        if work_kind == "extend-capability" and not target_root.is_dir():
            raise PluginDevelopmentError("要扩展的现有 Plugin 目标不存在。")
        if not desired_outcome.strip() or not missing_capabilities or any(
            not item.strip() for item in missing_capabilities
        ):
            raise PluginDevelopmentError("开发方案必须说明业务目标与实质缺口。")
        references = component_basis_refs or []
        if work_kind == "adapt-component" and not references:
            raise PluginDevelopmentError("组件适配方案必须绑定现有组件源码。")
        component_hashes = self._component_hashes(references) if work_kind == "adapt-component" else ()
        if self.intent == "conditional":
            if not (self._plugin_inventory_complete and self._source_inventory_complete):
                raise PluginDevelopmentError("条件授权需要完整的现有插件和正式资源检查。")
            if (self._matching_existing or target_plugin_id in self._existing_plugin_ids
                    or target_plugin_id in self._source_plugin_ids):
                return {"status": "reuse-existing", "targetPluginId": target_plugin_id}
        values: dict[str, object] = {
            "projectKey": self.project_key,
            "threadId": self.thread_id,
            "taskId": self.task_id,
            "requestId": self.request_id,
            "workKind": work_kind,
            "targetPluginId": target_plugin_id,
            "desiredOutcome": desired_outcome.strip(),
            "missingCapabilities": missing_capabilities,
            "reuseEvidenceRefs": reuse_evidence_refs,
            "uiScope": ui_scope.strip(),
            "dataScope": data_scope.strip(),
            "excludedOperations": excluded_operations or [],
            "componentBasisRefs": component_basis_refs or [],
            "componentBasisHashes": component_hashes,
            "targetFingerprint": self._target_fingerprint(target_root),
        }
        scope_hash = self._scope_hash(values)
        existing = next((record for record in self._proposals.values()
                         if record.task_id == self.task_id and record.scope_hash == scope_hash
                         and record.status in {"pending", "authorized", "adjust", "defer"}), None)
        if existing is not None:
            if existing.expires_at <= time.time():
                raise PluginDevelopmentError("开发方案已过期，请重新发起任务。")
            return existing.public_result()
        if self._active_proposal_id is not None:
            previous = self._proposals[self._active_proposal_id]
            if previous.status in {"pending", "authorized"}:
                self._proposals[previous.proposal_id] = replace(previous, status="superseded")
        grant_source = (
            "explicit-request" if self.intent == "explicit" else
            "conditional-request" if self.intent == "conditional" else None
        )
        record = PluginDevelopmentProposal(
            proposal_id=str(uuid4()), project_key=self.project_key,
            thread_id=self.thread_id, task_id=self.task_id,
            request_id=self.request_id, work_kind=work_kind,
            target_plugin_id=target_plugin_id, desired_outcome=desired_outcome.strip(),
            missing_capabilities=tuple(missing_capabilities),
            reuse_evidence_refs=tuple(reuse_evidence_refs),
            ui_scope=ui_scope.strip(), data_scope=data_scope.strip(),
            excluded_operations=tuple(excluded_operations or ()),
            component_basis_refs=tuple(component_basis_refs or ()),
            component_basis_hashes=component_hashes,
            target_fingerprint=self._target_fingerprint(target_root),
            scope_hash=scope_hash,
            status="authorized" if grant_source else "pending",
            grant_source=grant_source,
            expires_at=time.time() + 24 * 60 * 60,
        )
        self._proposals[record.proposal_id] = record
        self._active_proposal_id = record.proposal_id
        return record.public_result()

    def bind_question(
        self, proposal_id: str, *, question_id: str, checkpoint_id: str,
        question: dict[str, object],
    ) -> None:
        record = self._proposals.get(proposal_id)
        if (record is None or record.status != "pending" or record.task_id != self.task_id
                or record.expires_at <= time.time()
                or record.question_id is not None or not question_id or not checkpoint_id
                or record.question_fingerprint is None
                or record.question_fingerprint != self._scope_hash(question)):
            raise PluginDevelopmentError("开发决策问题与待决方案不匹配。")
        self._proposals[proposal_id] = replace(
            record, question_id=question_id, checkpoint_id=checkpoint_id,
        )

    def register_decision_question(
        self, proposal_id: str, question: dict[str, object],
    ) -> None:
        record = self._proposals.get(proposal_id)
        if (record is None or record.status != "pending" or record.task_id != self.task_id
                or record.question_id is not None):
            raise PluginDevelopmentError("只能为当前待决方案登记开发问题。")
        self._proposals[proposal_id] = replace(
            record, question_fingerprint=self._scope_hash(question),
        )

    def decide(
        self, proposal_id: str, *, question_id: str, checkpoint_id: str,
        choice: Literal["start", "adjust", "defer"],
    ) -> dict[str, object]:
        record = self._proposals.get(proposal_id)
        if (record is None or record.status != "pending" or record.task_id != self.task_id
                or record.expires_at <= time.time()
                or record.thread_id != self.thread_id or record.project_key != self.project_key
                or record.question_id != question_id or record.checkpoint_id != checkpoint_id):
            raise PluginDevelopmentError("开发决策已失效或与当前项目、线程、任务和检查点不匹配。")
        if choice not in {"start", "adjust", "defer"}:
            raise PluginDevelopmentError("未知开发决策。")
        if choice == "start":
            self._assert_basis_fresh(record)
        updated = replace(
            record, status="authorized" if choice == "start" else choice,
            grant_source="proposal-approval" if choice == "start" else None,
        )
        self._proposals[proposal_id] = updated
        return updated.public_result()

    @property
    def active(self) -> PluginDevelopmentProposal | None:
        record = self._proposals.get(self._active_proposal_id or "")
        return record if record is not None and record.task_id == self.task_id else None

    @property
    def can_expose_prepare(self) -> bool:
        return self.intent != "conditional" or (
            self._plugin_inventory_complete and self._source_inventory_complete
        )

    @property
    def needs_plugin_inventory(self) -> bool:
        return (
            self.intent == "conditional" and self._source_inventory_complete
            and not self._plugin_inventory_complete
        )

    @property
    def can_expose_create(self) -> bool:
        record = self.active
        return (
            record is not None and record.status == "authorized"
            and record.expires_at > time.time()
            and record.work_kind in {"create-plugin", "adapt-component"}
            and record.created_plugin_id is None
            and self._loaded_skill_hash is not None
            and self._loaded_skill_hash == self._current_skill_hash()
        )

    def mark_skill_loaded(self) -> None:
        path = self.skills_root / "ui-plugin-development" / "SKILL.md"
        self._loaded_skill_hash = hashlib.sha256(path.read_bytes()).hexdigest()

    def _current_skill_hash(self) -> str | None:
        path = self.skills_root / "ui-plugin-development" / "SKILL.md"
        try:
            return hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            return None

    def require_skill(self) -> None:
        record = self.active
        if record is None or record.status != "authorized" or record.expires_at <= time.time():
            raise PluginDevelopmentError("当前任务没有有效的开发授权。")
        if self._loaded_skill_hash is None or self._loaded_skill_hash != self._current_skill_hash():
            raise PluginDevelopmentError("首次开发写入前必须加载当前版本的 UI Plugin 开发 Skill。")
        self._assert_basis_fresh(record)

    def revoke_active(self) -> None:
        record = self.active
        if record is not None and record.status in {"pending", "authorized"}:
            self._proposals[record.proposal_id] = replace(record, status="superseded")

    def require_create(self, plugin_id: str) -> None:
        record = self.active
        if record is None or record.status != "authorized":
            raise PluginDevelopmentError("新 Plugin 开发缺少当前任务的有效授权。")
        if record.expires_at <= time.time():
            raise PluginDevelopmentError("开发授权已过期。")
        if record.project_key != self.project_key or record.thread_id != self.thread_id:
            raise PluginDevelopmentError("开发授权的项目或线程不匹配。")
        if record.target_plugin_id != plugin_id:
            raise PluginDevelopmentError("开发授权目标与要创建的 Plugin 目标不匹配。")
        if record.work_kind not in {"create-plugin", "adapt-component"}:
            raise PluginDevelopmentError("现有能力扩展授权不能创建新 Plugin 身份。")
        if record.created_plugin_id is not None:
            raise PluginDevelopmentError("本任务已创建 Plugin 身份；重试应续接原结果。")
        self.require_skill()

    def mark_created(self, plugin_id: str) -> None:
        record = self.active
        if record is None or record.status != "authorized" or record.target_plugin_id != plugin_id:
            raise PluginDevelopmentError("创建结果与当前开发授权不匹配。")
        assert self._active_proposal_id is not None
        self._proposals[self._active_proposal_id] = replace(
            self._proposals[self._active_proposal_id], created_plugin_id=plugin_id,
            target_fingerprint=self._target_fingerprint(self.project_root / agent_ui_source_path(
                self.project_root, f"plugins/{plugin_id}"
            ).lstrip("/")),
        )

    def note_authorized_target_write(self, plugin_id: str) -> None:
        record = self.active
        if record is None or record.status != "authorized" or record.target_plugin_id != plugin_id:
            return
        assert self._active_proposal_id is not None
        root = self.project_root / agent_ui_source_path(
            self.project_root, f"plugins/{plugin_id}"
        ).lstrip("/")
        self._proposals[self._active_proposal_id] = replace(
            record, target_fingerprint=self._target_fingerprint(root),
        )
