"""Read-only proposals for existing Plugin CSS. Never grants write authority."""
from __future__ import annotations

from collections import Counter
import difflib
import hashlib
from typing import Any


STRATEGIES = {
    "PLUGIN_RESPONSIVE_FULL_WIDTH_PADDING": {"box-sizing": "border-box", "min-width": "0", "max-width": "100%"},
    "PLUGIN_RESPONSIVE_MIN_WIDTH_AUTO": {"min-width": "0"},
    "PLUGIN_RESPONSIVE_FIXED_ROOT_WIDTH": {"max-width": "100%"},
}


def responsive_risks(warnings: list[dict[str, Any]], plugin_id: str) -> list[dict[str, Any]]:
    return [dict(item) for item in warnings if item.get("pluginId") == plugin_id
            and str(item.get("code", "")).startswith("PLUGIN_RESPONSIVE_")]


def build_repair_plan(*, plugin_id: str, slot: dict[str, Any],
                      risks: list[dict[str, Any]], sources: dict[str, str],
                      edits: list[dict[str, str]]) -> dict[str, Any]:
    """Exact reviewed anchors, rather than a warning-to-source rewrite engine."""
    proposals = []
    updated = dict(sources)
    for edit in edits:
        file = edit["file"]
        before, after = edit["before"], edit["after"]
        if file not in updated or not file.endswith(".css"):
            raise ValueError("Repair proposals may edit only inspected Plugin-owned CSS files.")
        if not edit.get("reason", "").strip() or not before or updated[file].count(before) != 1:
            raise ValueError("Each repair needs an explanation and one exact source anchor.")
        if before == after:
            raise ValueError("Repair proposal does not change source.")
        updated[file] = updated[file].replace(before, after, 1)
        proposals.append(dict(edit))
    diffs = {file: "".join(difflib.unified_diff(sources[file].splitlines(True), content.splitlines(True),
             fromfile=f"before/{file}", tofile=f"after/{file}"))
             for file, content in updated.items() if content != sources[file]}
    return {
        "pluginId": plugin_id, "slot": slot, "risks": risks,
        "responsiveRiskCount": len(risks),
        "sources": sources,
        "sourceHashes": {file: hashlib.sha256(content.encode()).hexdigest() for file, content in sources.items()},
        "strategyCandidates": [{"risk": risk, "declarations": STRATEGIES.get(risk["code"], {}),
                                "requiresCascadeAndComponentReview": True} for risk in risks],
        "edits": proposals, "diffs": diffs,
        "status": "awaiting-user-confirmation" if proposals else "analysis-required",
        "writeAuthorized": False, "browserAcceptance": "NOT_RUN",
        "reviewRequired": ["Check cascade and rendered ownership; warning may be a false positive.",
                           "Confirm CSS-in-JS, utilities, inline layout and complex animation separately; do not guess edits.",
                           "Present this exact diff, obtain user confirmation, then use existing scoped source mutation tools.",
                           "Re-read source hashes before editing; validate then test the delivered Plugin at 420px in four theme/locale combinations."],
    }


class ResponsiveRiskTracker:
    """Compare static hints within one run; resolved hints are not browser PASS."""
    def __init__(self) -> None:
        self.baseline: Counter[tuple[str, str, str, str]] | None = None
        self.current: Counter[tuple[str, str, str, str]] | None = None

    def observe(self, output: str, *, truncated: bool = False) -> None:
        import json
        self.current = None
        if truncated:
            return
        for index, char in enumerate(output):
            if char != "{" or (index and output[index - 1] != "\n"):
                continue
            try:
                report, _ = json.JSONDecoder().raw_decode(output[index:])
            except ValueError:
                continue
            if not isinstance(report, dict) or not isinstance(report.get("warnings"), list) or report.get("status") not in {"passed", "failed"}:
                continue
            self.current = Counter((str(item.get("pluginId", "")), str(item.get("file", item.get("path", ""))),
                             str(item.get("selector", "")), str(item["code"]))
                            for item in report["warnings"] if isinstance(item, dict)
                            and str(item.get("code", "")).startswith("PLUGIN_RESPONSIVE_"))
            if self.baseline is None:
                self.baseline = self.current.copy()
            return

    def to_dict(self) -> dict[str, Any]:
        return {"responsiveRiskCount": None if self.current is None else sum(self.current.values()),
                "responsiveRiskResolved": None if self.current is None or self.baseline is None else sum((self.baseline - self.current).values()),
                "responsiveRiskBaselineCount": None if self.baseline is None else sum(self.baseline.values()),
                "responsiveEvidenceKind": "static-hints-only"}
