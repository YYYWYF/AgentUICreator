"""Exercise the sidecar's real cold import order, without warmed pytest imports."""
from pathlib import Path
import subprocess
import sys


def test_server_imports_in_a_fresh_python_process():
    result = subprocess.run(
        [sys.executable, "-c", "import agent_ui_creator.server"],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, result.stderr
