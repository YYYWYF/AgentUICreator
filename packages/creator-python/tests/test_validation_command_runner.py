from __future__ import annotations

import asyncio
import json
import shutil

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.validation import CreatorValidationService
from agent_ui_creator.validation.command_runner import CreatorValidationCommandRunner


def host(root, manager=None, *, build=True):
    root.mkdir(parents=True, exist_ok=True)
    scripts = {name: f'node record.cjs {name}' for name in ('verify:ui', 'typecheck', 'build')}
    if not build:
        del scripts['build']
    manifest = {'name': 'validation-host', 'version': '1.0.0', 'scripts': scripts}
    if manager:
        manifest['packageManager'] = f'{manager}@1.0.0'
    (root / 'package.json').write_text(json.dumps(manifest))
    (root / 'record.cjs').write_text(
        "const fs = require('node:fs');\n"
        "fs.appendFileSync('calls.txt', process.argv[2] + '\\n');\n"
        "if (process.argv[2] === 'build' && fs.existsSync('fail-build')) {\n"
        "  console.error('HOST_BUILD_FAILED'); process.exit(7);\n"
        "}\n"
    )


@pytest.mark.parametrize('manager', ['pnpm', 'npm'])
def test_real_host_scripts_cache_revision_and_failed_build(tmp_path, manager):
    if not shutil.which(manager):
        pytest.skip(f'{manager} unavailable')
    host(tmp_path)
    (tmp_path / ("pnpm-lock.yaml" if manager == "pnpm" else "package-lock.json")).touch()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin('host-validation')
    service = CreatorValidationService(project_root=tmp_path, activity=activity)

    first = asyncio.run(service.validate(include_build=True))
    assert first.status == 'passed'
    assert [check.command for check in first.checks] == [
        f'{manager} run {name}' for name in ('verify:ui', 'typecheck', 'build')
    ]
    calls = (tmp_path / 'calls.txt').read_text()
    assert calls.splitlines() == ['typecheck', 'verify:ui', 'typecheck', 'build']
    cached = asyncio.run(service.validate(include_build=True))
    assert [check.source for check in cached.checks] == ['cached'] * 3
    assert (tmp_path / 'calls.txt').read_text() == calls

    activity.capture_before_content('fail-build', None)
    (tmp_path / 'fail-build').write_text('fail')
    activity.touch('fail-build')
    failed = asyncio.run(service.validate())  # build request remains sticky
    assert failed.revision == 1
    assert failed.status == 'failed'
    assert [check.source for check in failed.checks] == ['executed'] * 3
    assert 'HOST_BUILD_FAILED' in failed.checks[-1].output
    assert failed.checks[-1].exit_code != 0
    failed_calls = (tmp_path / 'calls.txt').read_text()
    cached_failure = asyncio.run(service.validate(include_build=True))
    assert cached_failure.status == 'failed'
    assert [check.source for check in cached_failure.checks] == ['cached'] * 3
    assert (tmp_path / 'calls.txt').read_text() == failed_calls
    assert (tmp_path / 'calls.txt').read_text().splitlines()[-3:] == ['verify:ui', 'typecheck', 'build']


@pytest.mark.parametrize('script', ['verify:ui', 'typecheck', 'build'])
def test_missing_script_fails_without_execution(tmp_path, script):
    host(tmp_path, 'npm')
    manifest = json.loads((tmp_path / 'package.json').read_text())
    del manifest['scripts'][script]
    (tmp_path / 'package.json').write_text(json.dumps(manifest))
    runner = CreatorValidationCommandRunner(tmp_path)
    result = asyncio.run(runner.execute_known_command(f'pnpm {script}'))
    assert result.exit_code is None
    assert f"no executable '{script}' script" in result.output
    assert runner.command_label(f'pnpm {script}') == f'{script} (not executed)'
    assert not (tmp_path / 'calls.txt').exists()


def test_missing_build_cannot_pass_service(tmp_path):
    host(tmp_path, 'npm', build=False)
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin('missing-build')
    result = asyncio.run(CreatorValidationService(
        project_root=tmp_path, activity=activity,
    ).validate(include_build=True))
    assert result.status == 'failed'
    assert result.checks[-1].command == 'build (not executed)'
    assert "no executable 'build' script" in result.checks[-1].output


@pytest.mark.parametrize(('lockfile', 'manager'), [
    ('pnpm-lock.yaml', 'pnpm'), ('package-lock.json', 'npm'),
    ('yarn.lock', 'yarn'), ('bun.lock', 'bun'), ('bun.lockb', 'bun'),
])
def test_lockfile_detection(tmp_path, lockfile, manager):
    host(tmp_path)
    (tmp_path / lockfile).touch()
    assert CreatorValidationCommandRunner(tmp_path).resolve_arguments('pnpm build') == (manager, 'run', 'build')


@pytest.mark.parametrize('kind', ['unknown', 'conflicting', 'unsupported', 'malformed'])
def test_invalid_host_evidence_fails_closed(tmp_path, kind):
    host(tmp_path)
    if kind == 'conflicting':
        (tmp_path / 'package-lock.json').touch()
        (tmp_path / 'pnpm-lock.yaml').touch()
    elif kind == 'unsupported':
        manifest = json.loads((tmp_path / 'package.json').read_text())
        manifest['packageManager'] = 'custom@1'
        (tmp_path / 'package.json').write_text(json.dumps(manifest))
    elif kind == 'malformed':
        (tmp_path / 'package.json').write_text('{')
    result = asyncio.run(CreatorValidationCommandRunner(tmp_path).execute_known_command('pnpm build'))
    assert result.exit_code is None
    assert 'resolution failed' in result.output
    assert not (tmp_path / 'calls.txt').exists()


def test_workspace_inheritance_and_explicit_declaration_priority(tmp_path):
    host(tmp_path, 'pnpm')
    (tmp_path / 'pnpm-workspace.yaml').write_text('packages: [child]')
    child = tmp_path / 'child'
    host(child)
    runner = CreatorValidationCommandRunner(child)
    assert runner.resolve_arguments('pnpm typecheck') == ('pnpm', 'run', 'typecheck')
    host(child, 'npm')
    (child / 'pnpm-lock.yaml').touch()
    assert runner.resolve_arguments('pnpm typecheck') == ('npm', 'run', 'typecheck')


def test_unrelated_ancestor_is_not_inherited(tmp_path):
    host(tmp_path, 'pnpm')
    child = tmp_path / 'child'
    host(child)
    result = asyncio.run(CreatorValidationCommandRunner(child).execute_known_command('pnpm build'))
    assert result.exit_code is None
    assert 'Cannot determine' in result.output


def test_unknown_command_is_never_executed(tmp_path):
    host(tmp_path, 'npm')
    with pytest.raises(KeyError):
        asyncio.run(CreatorValidationCommandRunner(tmp_path).execute_known_command('npm install antd'))
    assert not (tmp_path / 'calls.txt').exists()


def test_missing_executable_returns_failure(tmp_path, monkeypatch):
    host(tmp_path, 'npm')
    monkeypatch.setenv('PATH', '')
    result = asyncio.run(CreatorValidationCommandRunner(tmp_path).execute_known_command('pnpm build'))
    assert result.exit_code is None
    assert result.output


def test_blank_script_fails_closed(tmp_path):
    host(tmp_path, 'npm')
    manifest = json.loads((tmp_path / 'package.json').read_text())
    manifest['scripts']['build'] = '  '
    (tmp_path / 'package.json').write_text(json.dumps(manifest))
    result = asyncio.run(CreatorValidationCommandRunner(tmp_path).execute_known_command('pnpm build'))
    assert result.exit_code is None
    assert "no executable 'build' script" in result.output
