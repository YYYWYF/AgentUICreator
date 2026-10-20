from __future__ import annotations


class RegistryIntegrityError(RuntimeError):
    """Disk evidence disagrees with a registry operation; never a code repair."""

    code = "REGISTRY_SYNC_INTEGRITY_FAILED"
    failure_semantics = {
        "category": "workspace_integrity",
        "automaticRepairAllowed": False,
        "automaticCrossLayerRepairAllowed": False,
        "retryAllowed": False,
        "recovery": "stop_and_report_blocker",
    }

    def __init__(self, message: str, *, path: str, cause: BaseException | None = None):
        super().__init__(message)
        self.details = {
            "path": path,
            **({"causeType": type(cause).__name__, "cause": str(cause)} if cause else {}),
        }
