from __future__ import annotations

import hashlib
import json
import os
import tempfile
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from .models import (
    AuthorizationStatus,
    CurrentUserAuthorizationContext,
    ServiceAuthorizationRecord,
    ServiceContractError,
    ServiceOwnershipSpec,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


class ServiceContractAuthorizationStore:
    """Host-owned, project-persistent Service ownership authorizations."""

    def __init__(self, project_root: str | Path, *, thread_id: str | None = None) -> None:
        self.project_root = Path(project_root).resolve()
        self.thread_id = thread_id or "local"
        self.root = self.project_root / ".agentuicreator" / "service-authorizations"
        self._context: CurrentUserAuthorizationContext | None = None

    @property
    def scope_hash(self) -> str:
        payload = f"{self.project_root}\0{self.thread_id}".encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def set_current_user_context(
        self, *, current_user_message: str, run_id: str
    ) -> None:
        self._context = CurrentUserAuthorizationContext(
            current_user_message=current_user_message,
            thread_id=self.thread_id,
            run_id=run_id,
            project_root=str(self.project_root),
        )

    def require_evidence(self, evidence: str) -> None:
        context = self._context
        if context is None or evidence not in context.current_user_message:
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                "Authorization evidence must be an exact substring of the current real User message.",
            )

    def _path(self, proposal_id: str) -> Path:
        digest = hashlib.sha256(
            f"{self.scope_hash}\0{proposal_id}".encode("utf-8")
        ).hexdigest()
        return self.root / f"{digest}.json"

    def _persist(self, record: ServiceAuthorizationRecord) -> None:
        metadata_root = self.root.parent
        if metadata_root.exists() and metadata_root.is_symlink():
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                "Creator metadata directory cannot be a symbolic link.",
            )
        self.root.mkdir(parents=True, exist_ok=True)
        if self.root.is_symlink():
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                "Service authorization metadata directory cannot be a symbolic link.",
            )
        try:
            with (metadata_root / ".gitignore").open(
                "x", encoding="utf-8", newline=""
            ) as stream:
                stream.write("*\n")
        except FileExistsError:
            pass
        payload = json.dumps(
            record.to_dict(), ensure_ascii=False, sort_keys=True, separators=(",", ":")
        )
        descriptor, temporary = tempfile.mkstemp(
            prefix=".authorization-", suffix=".tmp", dir=self.root
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self._path(record.proposal_id))
        finally:
            Path(temporary).unlink(missing_ok=True)

    def _read_path(self, path: Path) -> ServiceAuthorizationRecord | None:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if value.get("schemaVersion") != 1:
                return None
            record = ServiceAuthorizationRecord.from_dict(value)
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            return None
        return record if record.scope_hash == self.scope_hash else None

    def records(self) -> tuple[ServiceAuthorizationRecord, ...]:
        if not self.root.is_dir() or self.root.is_symlink():
            return ()
        records = [
            record
            for path in sorted(self.root.glob("*.json"))
            if (record := self._read_path(path)) is not None
        ]
        return tuple(records)

    def create_proposal(
        self, spec: ServiceOwnershipSpec, *, authorized: bool
    ) -> ServiceAuthorizationRecord:
        for existing in self.records():
            if existing.status == "pending" and existing.spec != spec:
                self.update_status(existing, "invalidated")
        timestamp = _now()
        record = ServiceAuthorizationRecord(
            proposal_id=str(uuid4()),
            authorization_id=str(uuid4()) if authorized else None,
            spec=spec,
            status="authorized" if authorized else "pending",
            scope_hash=self.scope_hash,
            created_at=timestamp,
            updated_at=timestamp,
        )
        self._persist(record)
        return record

    def get_proposal(self, proposal_id: str) -> ServiceAuthorizationRecord:
        record = self._read_path(self._path(proposal_id))
        if record is None or record.proposal_id != proposal_id:
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_NOT_FOUND",
                "Service Contract ownership proposal was not found in this project and thread.",
            )
        return record

    def get_authorization(self, authorization_id: str) -> ServiceAuthorizationRecord:
        record = next(
            (
                candidate
                for candidate in self.records()
                if candidate.authorization_id == authorization_id
            ),
            None,
        )
        if record is None:
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_REQUIRED",
                "A valid Host-issued Service Contract authorizationId is required.",
            )
        if record.status not in {"authorized", "applied"}:
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                f"Service Contract authorization is {record.status}.",
            )
        return record

    def authorize(self, record: ServiceAuthorizationRecord) -> ServiceAuthorizationRecord:
        if record.status != "pending":
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                "Only a pending Service Contract proposal can be confirmed.",
            )
        updated = replace(
            record,
            authorization_id=str(uuid4()),
            status="authorized",
            updated_at=_now(),
        )
        self._persist(updated)
        return updated

    def update_status(
        self, record: ServiceAuthorizationRecord, status: AuthorizationStatus
    ) -> ServiceAuthorizationRecord:
        updated = replace(record, status=status, updated_at=_now())
        self._persist(updated)
        return updated

    def mark_applied(
        self, record: ServiceAuthorizationRecord
    ) -> ServiceAuthorizationRecord:
        current = self.get_proposal(record.proposal_id)
        if current.status == "applied":
            return current
        if current.status != "authorized":
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                f"Service Contract authorization is {current.status}.",
            )
        return self.update_status(current, "applied")

    def restore_authorized_after_clean_rollback(
        self, record: ServiceAuthorizationRecord
    ) -> ServiceAuthorizationRecord:
        current = self.get_proposal(record.proposal_id)
        if current.status != "applied":
            return current
        return self.update_status(current, "authorized")

    def has_current_applied(self) -> bool:
        return any(record.status == "applied" for record in self.records())

    def mark_completed(
        self, record: ServiceAuthorizationRecord
    ) -> ServiceAuthorizationRecord:
        current = self.get_proposal(record.proposal_id)
        if current.status != "applied":
            return current
        return self.update_status(current, "completed")
