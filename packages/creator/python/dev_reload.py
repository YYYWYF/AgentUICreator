"""Small dependency-free development supervisor for the Creator sidecar."""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path


def source_fingerprint(root: Path) -> tuple[tuple[str, int, int], ...]:
    files: list[tuple[str, int, int]] = []
    for directory, directory_names, file_names in os.walk(root):
        directory_names[:] = [name for name in directory_names if name != "__pycache__"]
        directory_path = Path(directory)
        for name in file_names:
            if not name.endswith(".py"):
                continue
            file_path = directory_path / name
            try:
                metadata = file_path.stat()
            except FileNotFoundError:
                continue
            files.append(
                (
                    str(file_path.relative_to(root)),
                    metadata.st_mtime_ns,
                    metadata.st_size,
                )
            )
    return tuple(sorted(files))


def stop_process(process: subprocess.Popen[bytes], timeout: float) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--poll-interval", type=float, default=0.5)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    arguments = parser.parse_args()
    command = arguments.command
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        parser.error("a sidecar command is required after --")
    if arguments.poll_interval <= 0:
        parser.error("--poll-interval must be greater than zero")

    stopping = False

    def request_stop(_signal: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)

    while not stopping:
        baseline = source_fingerprint(arguments.source_root)
        process = subprocess.Popen(command)
        restarting = False
        while process.poll() is None and not stopping:
            time.sleep(arguments.poll_interval)
            current = source_fingerprint(arguments.source_root)
            if current != baseline:
                print(
                    "creator python hot reload: source changed; restarting sidecar",
                    file=sys.stderr,
                    flush=True,
                )
                stop_process(process, timeout=3.0)
                restarting = True
                break
        if stopping:
            stop_process(process, timeout=3.0)
            return 0
        if restarting:
            continue
        if process.poll() is not None:
            return process.returncode or 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
