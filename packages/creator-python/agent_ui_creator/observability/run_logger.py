from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION = 1
_SECRET_KEY = re.compile(
    r"(?:^(?:authorization|cookie|password|secret|token)$|(?:^|[_-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_OPENAI_KEY = re.compile(r"\bsk-[A-Za-z0-9_-]{12,}")


def _safe_segment(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")[:80]
    return normalized or "run"


def _redact(value: Any, key: str = "") -> Any:
    if _SECRET_KEY.search(key):
        return "[REDACTED]"
    if isinstance(value, str):
        return _OPENAI_KEY.sub("sk-[REDACTED]", _BEARER.sub("Bearer [REDACTED]", value))[:50_000]
    if isinstance(value, Mapping):
        return {str(item_key): _redact(item, str(item_key)) for item_key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class CreatorRunLogger:
    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root).resolve()
        self.run_id = "unstarted"
        self.thread_id: str | None = None
        self.sequence = 0
        self.path: Path | None = None
        self.agent_mode = "domain-write"

    def begin(
        self,
        *,
        run_id: str,
        thread_id: str | None = None,
        agent_mode: str = "domain-write",
    ) -> None:
        self.run_id = run_id
        self.thread_id = thread_id
        self.agent_mode = agent_mode
        self.sequence = 0
        try:
            directory = self.project_root / ".agentuicreator" / "logs"
            resolved_directory = directory.resolve(strict=False)
            resolved_directory.relative_to(self.project_root.resolve(strict=True))
            directory.mkdir(parents=True, exist_ok=True)
            directory.resolve(strict=True).relative_to(self.project_root.resolve(strict=True))
            gitignore = directory.parent / ".gitignore"
            try:
                with gitignore.open("x", encoding="utf-8", newline="") as stream:
                    stream.write("*\n")
            except FileExistsError:
                pass
            timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
            timestamp = timestamp.replace("+00:00", "Z").replace(":", "-").replace(".", "-")
            self.path = directory / f"{timestamp}_{_safe_segment(run_id)}.jsonl"
            self.record(
                "run_started",
                {"runtime": "python", "agentMode": self.agent_mode},
            )
        except (OSError, ValueError):
            self.path = None

    def reference(self) -> dict[str, object] | None:
        if self.path is None:
            return None
        return {
            "format": "jsonl",
            "path": self.path.relative_to(self.project_root).as_posix(),
            "schemaVersion": CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
        }

    def record(self, event_type: str, data: Mapping[str, object]) -> None:
        if self.path is None:
            return
        self.sequence += 1
        entry = {
            "schemaVersion": CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
            "sequence": self.sequence,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "type": event_type,
            "runId": self.run_id,
            **({"threadId": self.thread_id} if self.thread_id is not None else {}),
            "data": _redact(data),
        }
        try:
            with self.path.open("a", encoding="utf-8", newline="") as stream:
                stream.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
        except OSError:
            self.path = None

    def finish(
        self,
        outcome: str,
        *,
        metrics: Mapping[str, object] | None = None,
        mutation_metrics: Mapping[str, object] | None = None,
        error: BaseException | None = None,
    ) -> None:
        self.record(
            "run_finished",
            {
                "runtime": "python",
                "agentMode": self.agent_mode,
                "outcome": outcome,
                **({"modelToolMetrics": dict(metrics)} if metrics is not None else {}),
                **(dict(mutation_metrics) if mutation_metrics is not None else {}),
                **({"error": str(error)} if error is not None else {}),
            },
        )
