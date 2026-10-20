from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
import time

import pytest

from agent_ui_creator.validation import command_runner as module


CHILD = '''
import os, signal, time
from pathlib import Path
if hasattr(signal, 'SIGTERM'):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
Path('child.pid').write_text(str(os.getpid()))
while True:
    Path('heartbeat').write_text(str(time.monotonic()))
    time.sleep(.02)
'''


@pytest.mark.parametrize('mode', ['timeout', 'cancel', 'inherited_pipe', 'closed_pipe', 'double_cancel'])
def test_real_descendant_cleanup_is_bounded(tmp_path, monkeypatch, mode):
    monkeypatch.setattr(module, 'COMMAND_TIMEOUT_SECONDS', 0.7)
    monkeypatch.setattr(module, 'PROCESS_TERMINATE_SECONDS', 0.2)
    monkeypatch.setattr(module, 'PROCESS_KILL_SECONDS', 0.3)
    monkeypatch.setattr(module, 'PIPE_DRAIN_SECONDS', 0.2)
    (tmp_path / 'child.py').write_text(CHILD)
    parent = '''
import os, subprocess, sys, time
from pathlib import Path
Path('parent.pid').write_text(str(os.getpid()))
subprocess.Popen([sys.executable, 'child.py']%s)
while not Path('child.pid').exists(): time.sleep(.01)
print('parent ready', flush=True)
%s
''' % (", stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL" if mode == 'closed_pipe' else '',
       '' if mode in {'inherited_pipe', 'closed_pipe'} else 'time.sleep(60)')
    (tmp_path / 'parent.py').write_text(parent)

    async def run():
        started = time.monotonic()
        task = asyncio.create_task(module.CreatorValidationCommandRunner(tmp_path).execute_arguments(
            (sys.executable, 'parent.py')))
        while not (tmp_path / 'child.pid').exists():
            if task.done():
                result = task.result()
                pytest.fail(f'Command exited before spawning child: {result}')
            assert time.monotonic() - started < 3
            await asyncio.sleep(.01)
        if mode in {'cancel', 'double_cancel'}:
            task.cancel()
            if mode == 'double_cancel':
                await asyncio.sleep(.03)
                task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, 3)
        else:
            result = await asyncio.wait_for(task, 3)
            if mode != 'closed_pipe':
                assert result.failure_kind == 'timeout'
                assert 'parent ready' in result.output
            else:
                assert result.exit_code == 0
        assert time.monotonic() - started < 3
        # All runner-owned reader and cleanup tasks have finished.
        assert not [t for t in asyncio.all_tasks() if t is not asyncio.current_task() and not t.done()]

    try:
        asyncio.run(run())
        heartbeat = (tmp_path / 'heartbeat').read_text()
        time.sleep(.15)
        assert (tmp_path / 'heartbeat').read_text() == heartbeat
        if os.name != 'nt':
            for file in ['parent.pid', 'child.pid']:
                pid = (tmp_path / file).read_text()
                status = subprocess.run(['ps', '-o', 'stat=', '-p', pid], capture_output=True, text=True)
                assert not status.stdout.strip() or status.stdout.strip().startswith('Z')
    finally:
        # Even a regression must not leave the test's infinite child behind.
        if os.name != 'nt':
            for file in ['parent.pid', 'child.pid']:
                if (tmp_path / file).exists():
                    try:
                        os.kill(int((tmp_path / file).read_text()), signal.SIGKILL)
                    except ProcessLookupError:
                        pass


def test_windows_job_cleanup_escalates_even_after_parent_exit(monkeypatch):
    events = []
    class Job:
        def close(self): events.append('job-close')
    class Process:
        pid = 123
        returncode = 0
        async def wait(self): events.append('wait')
    asyncio.run(module.cleanup_process_tree(Process(), Job()))
    assert events.count('job-close') == 2  # idempotent close in escalation and finally


def test_windows_group_options(monkeypatch):
    monkeypatch.setattr(module.os, 'name', 'nt')
    monkeypatch.setattr(module.subprocess, 'CREATE_NEW_PROCESS_GROUP', 512, raising=False)
    assert module.process_group_options() == {'creationflags': 512}


@pytest.mark.parametrize('failure', [None, 'SetInformationJobObject', 'AssignProcessToJobObject'])
def test_windows_job_handle_lifecycle(monkeypatch, failure):
    from agent_ui_creator.validation import windows_job
    events = []
    class Function:
        def __init__(self, name): self.name = name
        def __call__(self, *args):
            events.append((self.name, args))
            if self.name == failure: return 0
            return {'CreateJobObjectW': 101, 'OpenProcess': 202}.get(self.name, 1)
    class Kernel:
        def __init__(self):
            for name in ['CreateJobObjectW', 'SetInformationJobObject', 'AssignProcessToJobObject', 'OpenProcess', 'CloseHandle']:
                setattr(self, name, Function(name))
    monkeypatch.setattr(windows_job.ctypes, 'WinDLL', lambda *a, **kw: Kernel(), raising=False)
    monkeypatch.setattr(windows_job.ctypes, 'WinError', lambda *a: OSError('job failed'), raising=False)
    monkeypatch.setattr(windows_job.ctypes, 'get_last_error', lambda: 5, raising=False)
    if failure == 'SetInformationJobObject':
        with pytest.raises(OSError): windows_job.WindowsJob()
    else:
        job = windows_job.WindowsJob()
        try:
            if failure:
                with pytest.raises(OSError): job.attach(123)
            else:
                job.attach(123)
        finally:
            job.close()
            job.close()
        assert ('CloseHandle', (202,)) in events
    assert events.count(('CloseHandle', (101,))) == 1
