"""Build an npm sidecar artifact using Python only; no Node, venv, or system Python at runtime."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

CREATOR = Path(__file__).resolve().parent.parent
WORKSPACE = CREATOR.parent.parent


def source_hash() -> str:
    records: list[tuple[str, Path]] = []
    for file in (CREATOR / "python/agent_ui_creator").rglob("*.py"):
        if "__pycache__" not in file.parts:
            records.append((file.relative_to(CREATOR / "python").as_posix(), file))
    for file in (CREATOR / "contracts/creator").rglob("*"):
        if file.is_file():
            records.append(("_contracts/creator/" + file.relative_to(CREATOR / "contracts/creator").as_posix(), file))
    for name in ("pyproject.toml", "requirements.lock"):
        records.append((name, CREATOR / "python" / name))
    digest = hashlib.sha256()
    for name, file in sorted(records):
        content = file.read_bytes().replace(b"\r\n", b"\n")
        digest.update(f"{name}\0{hashlib.sha256(content).hexdigest()}\n".encode())
    return digest.hexdigest()


def host_platform() -> str:
    operating_system = {"Windows": "win32", "Darwin": "darwin", "Linux": "linux"}.get(platform.system())
    architecture = {"AMD64": "x64", "x86_64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(platform.machine())
    return f"{operating_system}-{architecture}"


def isolated_environment(agent_root: Path | None = None) -> dict[str, str]:
    environment = dict(os.environ)
    for name in ("PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV", "PIP_TARGET", "PIP_PREFIX", "PIP_USER"):
        environment.pop(name, None)
    environment.update(PYTHONNOUSERSITE="1", PYTHONDONTWRITEBYTECODE="1")
    if agent_root is not None:
        environment["PYTHONPATH"] = str(agent_root)
    return environment


def check_archive(archive: Path, expected_sha256: str) -> None:
    with archive.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != expected_sha256:
        raise ValueError("Standalone CPython archive SHA-256 does not match the reviewed platform manifest")


def pack(package_root: Path, destination: Path) -> Path:
    manifest = json.loads((package_root / "package.json").read_text())
    filename = manifest["name"].removeprefix("@").replace("/", "-") + "-" + manifest["version"] + ".tgz"
    destination.mkdir(parents=True, exist_ok=True)
    artifact = destination / filename
    with tarfile.open(artifact, "w:gz", dereference=True) as tar:
        for name in ("package.json", "README.md", "sidecar.json", "dist"):
            tar.add(package_root / name, arcname="package/" + name)
    return artifact


def build(platform_id: str, destination: Path, archive: Path | None = None) -> Path:
    if platform_id != host_platform():
        raise ValueError("Build and smoke-test sidecars on the matching OS and CPU architecture")
    configuration = json.loads((CREATOR / "python/sidecar-platforms.json").read_text())
    selected = configuration["platforms"][platform_id]
    package_root = WORKSPACE / "packages/creator/platforms" / platform_id
    if package_root.resolve().parent != (WORKSPACE / "packages/creator/platforms").resolve():
        raise ValueError("Platform package escapes the sidecar workspace")
    manifest = json.loads((package_root / "package.json").read_text())
    initial_hash = source_hash()
    with tempfile.TemporaryDirectory(prefix="creator-sidecar-") as temporary:
        staging = Path(temporary)
        if archive is None:
            version, release = configuration["pythonVersion"], configuration["release"]
            filename = f"cpython-{version}%2B{release}-{selected['target']}-install_only.tar.gz"
            archive = WORKSPACE / "packages/creator/platforms/dist/cache" / filename.replace("%2B", "+")
            archive.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://github.com/astral-sh/python-build-standalone/releases/download/{release}/{filename}"
            if not archive.exists():
                print(f"Downloading pinned CPython for {platform_id}", flush=True)
                with urllib.request.urlopen(url, timeout=120) as response, archive.open("wb") as output:
                    shutil.copyfileobj(response, output)
        check_archive(archive, selected["sha256"])
        unpacked = staging / "unpacked"
        with tarfile.open(archive, "r:gz") as tar:
            tar.extractall(unpacked, filter="data")
        runtime = staging / "dist/python"
        runtime.parent.mkdir(parents=True)
        # npm does not retain symbolic links. Materialize internal interpreter/library links.
        shutil.copytree(unpacked / "python", runtime, symlinks=False)
        executable = runtime / selected["executable"]
        subprocess.run([str(executable), "-m", "pip", "install", "--disable-pip-version-check", "--no-user",
                        "--only-binary=:all:", "--no-deps", "--no-compile", "--no-warn-script-location", "--quiet", "-r", str(CREATOR / "python/requirements.lock")],
                       env=isolated_environment(), check=True)
        subprocess.run([str(executable), "-m", "pip", "check"], env=isolated_environment(), check=True)
        agent = staging / "dist/agent"
        shutil.copytree(CREATOR / "python/agent_ui_creator", agent / "agent_ui_creator",
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        shutil.copytree(CREATOR / "contracts/creator", agent / "agent_ui_creator/_contracts/creator")
        shutil.copytree(CREATOR / "skills", agent / "agent_ui_creator/_skills")
        for name in ("pyproject.toml", "requirements.lock"):
            shutil.copyfile(CREATOR / "python" / name, agent / name)
        # Validate after relocation, including compiled dependencies, contracts and model harness.
        relocated = staging / "relocated dist 中文"
        (staging / "dist").rename(relocated)
        executable = relocated / "python" / selected["executable"]
        smoke = "import ssl, sqlite3, subprocess, sys; import cryptography, pydantic_core, langgraph, deepagents; import agent_ui_creator.server; from agent_ui_creator.contract_resources import read_creator_contract; assert read_creator_contract('operator.schema.json')['$id']; subprocess.run([sys.executable, '-c', 'import ssl, pydantic_core'], check=True)"
        subprocess.run([str(executable), "-c", smoke], cwd=staging,
                       env=isolated_environment(relocated / "agent"), check=True)
        if source_hash() != initial_hash:
            raise ValueError("Creator source changed during sidecar build; rebuild before publishing")
        dist = package_root / "dist"
        # Fixed workspace-owned target; never delete a caller-supplied path.
        if dist.is_symlink() or dist.resolve().parent != package_root.resolve():
            raise ValueError("Sidecar output escapes its platform package")
        if dist.exists():
            shutil.rmtree(dist)
        shutil.copytree(relocated, dist)
        descriptor = {
            "schemaVersion": 1, "name": manifest["name"], "version": manifest["version"],
            "platform": platform_id.split("-")[0], "arch": platform_id.split("-")[1],
            "pythonVersion": configuration["pythonVersion"], "sourceHash": initial_hash,
            "executable": "dist/python/" + selected["executable"], "pythonPackageRoot": "dist/agent",
            "pythonArchiveSha256": selected["sha256"],
            "files": {},
        }
        for file in sorted(dist.rglob("*")):
            if file.is_file():
                with file.open("rb") as source:
                    descriptor["files"][file.relative_to(package_root).as_posix()] = hashlib.file_digest(source, "sha256").hexdigest()
        (package_root / "sidecar.json").write_text(json.dumps(descriptor, indent=2) + "\n", encoding="utf-8")
    return pack(package_root, destination)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", default=host_platform())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--python-archive", type=Path, help="Offline archive matching the pinned SHA-256")
    arguments = parser.parse_args()
    print(build(arguments.platform, arguments.output.resolve(), arguments.python_archive))
