"""Host storage for a ProjectControl-planned theme change; never invokes a model."""
from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
from pathlib import Path
from uuid import uuid4
from .files import read_creator_file_state, replace_creator_file_atomically, remove_creator_file
from .transactions import CreatorTransactionStore, CreatorTransactionFileInput

JOURNAL = ".agentuicreator/control/pending-theme-command.json"


async def verify_published_theme(root: Path, runtime: str) -> dict:
    # Bind verification to the managed tool entry, rather than executing a caller-selected module.
    entry = (root / ".agent-ui/control/project-control.mjs").read_text()
    match = re.search(r'import \{ runUIProjectControlCli \} from ("[^"\n]+");', entry)
    if not match or json.loads(match.group(1)) != runtime:
        raise ValueError("THEME_VERIFIER_RUNTIME_MISMATCH")
    node = os.environ.get("CREATOR_NODE_EXECUTABLE") or shutil.which("node")
    if not node:
        raise ValueError("CONTROL_RUNTIME_MISSING")
    script = "const {verifyUIProject}=await import(process.argv[1]); process.stdout.write(JSON.stringify(await verifyUIProject(process.argv[2])));"
    process = await asyncio.create_subprocess_exec(node, "--input-type=module", "-e", script, runtime, str(root),
        cwd=root, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60)
    except BaseException:
        if process.returncode is None:
            process.kill()
        await process.wait()
        raise
    if process.returncode != 0:
        raise ValueError("THEME_STATIC_VALIDATION_FAILED: " + stderr.decode(errors="replace")[-2000:])
    result = json.loads(stdout)
    if not isinstance(result, dict) or result.get("status") not in {"passed", "failed"}:
        raise ValueError("THEME_VERIFICATION_RESULT_INVALID")
    return result


def rollback_pending_theme(root: Path, *, owned_run: str | None = None) -> None:
    state = read_creator_file_state(root, JOURNAL)
    if not state.exists:
        return
    journal = json.loads(state.content)
    if not isinstance(journal, dict) or set(journal) != {"runId", "ownerPid"}:
        raise ValueError("THEME_COMMAND_JOURNAL_INVALID")
    run_id, owner = journal["runId"], journal["ownerPid"]
    if not isinstance(run_id, str) or not isinstance(owner, int) or owner <= 0:
        raise ValueError("THEME_COMMAND_JOURNAL_INVALID")
    if owned_run != run_id:
        try:
            os.kill(owner, 0)
        except ProcessLookupError:
            pass
        else:
            raise ValueError("CREATOR_COMMAND_BUSY")
    store = CreatorTransactionStore(root)
    record = store.load(run_id)
    if len(record.files) != 1 or not record.files[0].path.endswith("/agent-ui/theme/theme-config.ts"):
        raise ValueError("THEME_COMMAND_JOURNAL_INVALID")
    file = record.files[0]
    current = read_creator_file_state(root, file.path)
    if current.hash != file.before.hash:
        store.undo(run_id)  # Uses the shared backend's conflict checks and atomic restoration.
    remove_creator_file(root, JOURNAL)


async def commit_theme_change(root: Path, change: dict) -> dict:
    rollback_pending_theme(root)
    config = json.loads((root / ".agent-ui/project.json").read_text())
    canonical = (Path(config["sourceRoot"]) / "agent-ui/theme/theme-config.ts").as_posix()
    if change["path"] != canonical:
        raise ValueError("Command storage only owns the canonical theme configuration.")
    current = read_creator_file_state(root, canonical)
    if current.content != change["before"]:
        raise ValueError("THEME_CONFIGURATION_CHANGED")
    if change["before"] == change["after"]:
        verification = await verify_published_theme(root, change["verificationRuntime"])
        if verification["status"] != "passed":
            raise ValueError("THEME_STATIC_VALIDATION_FAILED")
        return {"verification": verification}
    run_id = str(uuid4())
    store = CreatorTransactionStore(root)
    files = [CreatorTransactionFileInput(canonical, change["before"], change["after"])]
    # An unverified durable record exists before publication. The journal rolls it back after a crash.
    store.persist_run(run_id=run_id, mutation_revision=1, validation_revision=None, files=files)
    replace_creator_file_atomically(root, JOURNAL, json.dumps({"runId": run_id, "ownerPid": os.getpid()}))
    try:
        replace_creator_file_atomically(root, canonical, change["after"], expected=current)
        verification = await verify_published_theme(root, change["verificationRuntime"])
        if verification["status"] != "passed":
            raise ValueError("THEME_STATIC_VALIDATION_FAILED: " + json.dumps(verification.get("errors", [])))
        if read_creator_file_state(root, canonical).content != change["after"]:
            raise ValueError("THEME_CONFIGURATION_CHANGED")
        store.persist_run(run_id=run_id, mutation_revision=1, validation_revision=1, files=files)
        remove_creator_file(root, JOURNAL)
        return {"runId": run_id, "verification": verification}
    except BaseException:
        rollback_pending_theme(root, owned_run=run_id)
        raise
