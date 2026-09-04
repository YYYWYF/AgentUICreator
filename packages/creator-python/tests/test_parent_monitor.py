from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agent_ui_creator.server import _monitor_parent


def test_parent_monitor_stops_server_when_parent_changes(monkeypatch):
    server = SimpleNamespace(should_exit=False)

    async def no_wait(_seconds: float) -> None:
        return None

    monkeypatch.setattr("agent_ui_creator.server.asyncio.sleep", no_wait)
    monkeypatch.setattr("agent_ui_creator.server.os.getppid", lambda: 999_999)

    asyncio.run(_monitor_parent(server, parent_pid=111_111))

    assert server.should_exit is True
