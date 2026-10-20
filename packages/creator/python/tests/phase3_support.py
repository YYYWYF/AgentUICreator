"""Real installed Operator/Plugin fixture shared by contract and opt-in live tests."""
from __future__ import annotations
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[4]
SKILLS = ROOT / 'packages/creator/skills'
MODEL_PATH = 'src/agent-ui/app-ui/app-ui.json'


def prepare_host(root: Path) -> Path:
    script = Path(__file__).parent / 'fixtures/phase3/prepare-host.mjs'
    subprocess.run(['node', str(script), str(root.resolve()), str(ROOT)], check=True,
                   capture_output=True, text=True, timeout=90)
    return root


def clone_host(source: Path, target: Path) -> Path:
    shutil.copytree(source, target, ignore=shutil.ignore_patterns('node_modules', '.agent-ui', 'dist'))
    # Native junction on Windows avoids requiring symlink privileges.
    subprocess.run(['node', '--input-type=module', '-e',
                    'import {symlink} from "node:fs/promises"; await symlink(process.argv[1],process.argv[2],process.platform==="win32"?"junction":"dir");',
                    str(source / 'node_modules'), str(target / 'node_modules')], check=True, timeout=10)
    return target


def model(root: Path) -> dict:
    return json.loads((root / MODEL_PATH).read_text(encoding='utf-8'))


def instances(value):
    if isinstance(value, dict):
        if 'pluginId' in value and 'id' in value:
            yield value
        for child in value.values():
            yield from instances(child)
    elif isinstance(value, list):
        for child in value:
            yield from instances(child)
