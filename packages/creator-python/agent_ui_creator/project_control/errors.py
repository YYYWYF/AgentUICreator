from __future__ import annotations

from typing import Any


class ProjectControlError(RuntimeError):
    """Stable failure returned by the cross-language ProjectControl boundary."""

    code: str
    details: Any

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details
