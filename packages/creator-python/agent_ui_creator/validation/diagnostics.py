from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import Path


_ANSI_ESCAPE = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
_TS_EXTENSION = r"(?:d\.)?(?:[cm]?tsx?|[cm]?jsx?)"
_TS_PAREN_DIAGNOSTIC = re.compile(
    rf"(?P<path>[^():\n]+?\.{_TS_EXTENSION})\(\d+,\s*\d+\)\s*:\s*"
    r"error\s+TS(?P<code>\d+)\s*:\s*(?P<message>.*)$",
    re.IGNORECASE,
)
_TS_COLON_DIAGNOSTIC = re.compile(
    rf"(?P<path>[^():\n]+?\.{_TS_EXTENSION}):\d+:\d+\s*(?::|-)+\s*"
    r"error\s+TS(?P<code>\d+)\s*:\s*(?P<message>.*)$",
    re.IGNORECASE,
)
_TS_GLOBAL_DIAGNOSTIC = re.compile(
    r"^(?:.*?[:\s])?error\s+TS(?P<code>\d+)\s*:\s*(?P<message>.*)$",
    re.IGNORECASE,
)
_TS_ERROR_MARKER = re.compile(r"\berror\s+TS\d+\b", re.IGNORECASE)
_NON_DIAGNOSTIC_FAILURE_MARKER = re.compile(
    r"(?:ERR_PNPM_|ELIFECYCLE|command failed|\bfailed\b|\bscope:\b|"
    r"\bfound\s+\d+\s+errors?\b|\bno\s+errors?\b)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class TypeScriptDiagnostic:
    """The stable identity and first-line evidence of one TypeScript error."""

    path: str
    code: str
    message: str

    @property
    def fingerprint(self) -> tuple[str, str, str]:
        return self.path, self.code, self.message

    def to_dict(self) -> dict[str, str]:
        return {
            "path": self.path,
            "code": self.code,
            "message": self.message,
        }


@dataclass(frozen=True, slots=True)
class TypeScriptDiagnosticParseResult:
    available: bool
    diagnostics: tuple[TypeScriptDiagnostic, ...]
    reason: str | None = None


def _normalize_path(raw_path: str, project_root: str | Path | None) -> str:
    normalized = raw_path.strip().replace("\\", "/")
    if project_root is not None and normalized.startswith("/"):
        try:
            absolute = Path(normalized).resolve(strict=False)
            root = Path(project_root).resolve(strict=False)
            normalized = absolute.relative_to(root).as_posix()
        except (OSError, ValueError):
            pass
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized or "<unknown>"


def _diagnostic_from_match(
    match: re.Match[str], project_root: str | Path | None
) -> TypeScriptDiagnostic:
    return TypeScriptDiagnostic(
        path=_normalize_path(match.group("path"), project_root),
        code=f"TS{match.group('code')}",
        message=re.sub(r"\s+", " ", match.group("message").strip()),
    )


def _sorted_diagnostics(
    diagnostics: list[TypeScriptDiagnostic],
) -> tuple[TypeScriptDiagnostic, ...]:
    return tuple(sorted(diagnostics, key=lambda diagnostic: diagnostic.fingerprint))


def parse_typescript_diagnostics(
    output: str,
    *,
    project_root: str | Path | None = None,
    exit_code: int | None,
    truncated: bool = False,
) -> TypeScriptDiagnosticParseResult:
    """Parse common tsc error lines and fail closed when the set is uncertain.

    The parser intentionally fingerprints only the normalized path, diagnostic
    code, and first diagnostic message line.  It does not use line or column
    numbers as identity.
    """

    if truncated:
        return TypeScriptDiagnosticParseResult(
            available=False,
            diagnostics=(),
            reason="typecheck output was truncated",
        )
    if exit_code is None:
        return TypeScriptDiagnosticParseResult(
            available=False,
            diagnostics=(),
            reason="typecheck command did not produce an exit code",
        )

    diagnostics: list[TypeScriptDiagnostic] = []
    saw_unparsed_typescript_error = False
    for raw_line in output.splitlines():
        line = _ANSI_ESCAPE.sub("", raw_line).strip()
        if not line:
            continue
        match = _TS_PAREN_DIAGNOSTIC.search(line)
        if match is None:
            match = _TS_COLON_DIAGNOSTIC.search(line)
        if match is not None:
            diagnostics.append(_diagnostic_from_match(match, project_root))
            continue
        global_match = _TS_GLOBAL_DIAGNOSTIC.match(line)
        if global_match is not None:
            diagnostics.append(
                TypeScriptDiagnostic(
                    path="<global>",
                    code=f"TS{global_match.group('code')}",
                    message=re.sub(
                        r"\s+", " ", global_match.group("message").strip()
                    ),
                )
            )
            continue
        if _TS_ERROR_MARKER.search(line):
            saw_unparsed_typescript_error = True
        elif re.search(r"\berror\b", line, re.IGNORECASE) and not _NON_DIAGNOSTIC_FAILURE_MARKER.search(line):
            saw_unparsed_typescript_error = True

    if saw_unparsed_typescript_error:
        return TypeScriptDiagnosticParseResult(
            available=False,
            diagnostics=(),
            reason="an unrecognized TypeScript diagnostic was present",
        )
    if exit_code != 0 and not diagnostics:
        return TypeScriptDiagnosticParseResult(
            available=False,
            diagnostics=(),
            reason="non-zero typecheck exited without parseable TypeScript diagnostics",
        )
    return TypeScriptDiagnosticParseResult(
        available=True,
        diagnostics=_sorted_diagnostics(diagnostics),
    )
