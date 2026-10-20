from __future__ import annotations

import argparse
import os
import zipfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_DIRECTORY_NAMES = {".git", ".venv", "node_modules", "tests"}


def repository_files(root: Path, output: Path):
    for current_directory, directory_names, file_names in os.walk(
        root, topdown=True, followlinks=False
    ):
        current_path = Path(current_directory)
        directory_names[:] = sorted(
            name for name in directory_names if name not in EXCLUDED_DIRECTORY_NAMES
        )

        for file_name in sorted(file_names):
            source = current_path / file_name
            if source.resolve() == output:
                continue
            if source.is_file():
                yield source


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Create a ZIP of the repository, excluding .venv, node_modules, "
            "tests, and .git directories at any depth."
        )
    )
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        help="Output ZIP path (default: a ZIP beside the repository directory).",
    )
    arguments = parser.parse_args()

    output = arguments.output or REPOSITORY_ROOT.parent / f"{REPOSITORY_ROOT.name}.zip"
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    files = list(repository_files(REPOSITORY_ROOT, output))
    with zipfile.ZipFile(
        output, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
    ) as archive:
        for source in files:
            relative_path = source.relative_to(REPOSITORY_ROOT)
            archive_name = (Path(REPOSITORY_ROOT.name) / relative_path).as_posix()
            archive.write(source, archive_name)

    print(f"Created {output} ({len(files)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
