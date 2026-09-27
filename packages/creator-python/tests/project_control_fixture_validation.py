"""Canonical JSON Schema oracle used by both language suites."""
from __future__ import annotations
import json
from pathlib import Path
import sys

# Also executable by the TypeScript differential suite from a source checkout.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from agent_ui_creator.project_control.client import _load_protocol_validator

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "contracts/creator/fixtures/project-control"


def canonical_fixture_outcomes():
    validator = _load_protocol_validator()
    inventory = json.loads((ROOT / "contracts/creator/project-control.operations.json").read_text())
    definitions = {entry["name"]: entry["resultDef"] for entry in inventory["operations"]}
    manifest = json.loads((FIXTURES / "manifest.json").read_text())
    results = {}
    for kind, entries in manifest.items():
        for entry in entries:
            definition = "request" if kind == "requests" else definitions[entry["operation"]]
            scoped = validator.evolve(schema={
                "$schema": validator.schema["$schema"],
                "$id": validator.schema["$id"],
                "$defs": validator.schema["$defs"],
                "$ref": f"#/$defs/{definition}",
            })
            results[entry["file"]] = scoped.is_valid(json.loads((FIXTURES / entry["file"]).read_text()))
    return results


if __name__ == "__main__":
    print(json.dumps(canonical_fixture_outcomes()))
