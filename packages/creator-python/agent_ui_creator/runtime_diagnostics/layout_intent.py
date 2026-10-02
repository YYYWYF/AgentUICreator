"""Compare fixed authoring dimensions with measured DOM geometry, never CSS intent alone."""
from __future__ import annotations

import re


def _pixels(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and re.fullmatch(r"\d+(?:\.\d+)?px", value):
        return float(value[:-2])
    return None


def layout_intent_checks(layout: dict, observations: list[dict]) -> list[dict]:
    rectangles = {item.get("nodeRef"): item.get("rect", {}) for item in observations}
    checks = []
    def check(node, property_, expected):
        if expected is None:
            return
        actual = rectangles.get(node.get("nodeRef"), {}).get(property_)
        checks.append({"nodeRef": node.get("nodeRef"), "property": property_, "expected": expected,
                       "actual": actual, "status": "unavailable" if actual is None else
                       "passed" if abs(actual - expected) <= 1 else "failed"})
    def visit(node):
        if not isinstance(node, dict):
            return
        for property_ in ("width", "height"):
            check(node, property_, _pixels(node.get(property_)))
        children = node.get("children", [])
        if node.get("type") in {"row", "column"}:
            property_ = "width" if node["type"] == "row" else "height"
            sizes = node.get("sizes", [])
            for child, size in zip(children, sizes):
                check(child, property_, _pixels(size))
            if any(_pixels(size) is not None for size in sizes) or "gap" in node:
                position = "x" if node["type"] == "row" else "y"
                for previous, child in zip(children, children[1:]):
                    previous_rect = rectangles.get(previous.get("nodeRef"), {})
                    if position not in previous_rect or property_ not in previous_rect:
                        checks.append({"nodeRef": child.get("nodeRef"), "property": position, "status": "unavailable"})
                    else:
                        check(child, position, previous_rect[position] + previous_rect[property_] + node.get("gap", 0))
        for child in children:
            visit(child)
        visit(node.get("child"))
    visit(layout)
    return checks


def has_fixed_geometry(layout: dict) -> bool:
    return bool(layout_intent_checks(layout, []))
