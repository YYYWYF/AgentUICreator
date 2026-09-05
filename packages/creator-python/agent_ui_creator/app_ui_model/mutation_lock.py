from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator


class ProjectMutationCoordinator:
    """Sidecar-owned serialization for complete per-project mutation windows."""

    def __init__(self) -> None:
        self._locks: dict[Path, asyncio.Lock] = {}
        self._guard = asyncio.Lock()

    @asynccontextmanager
    async def transaction(self, project_root: str | Path) -> AsyncIterator[None]:
        resolved = Path(project_root).resolve()
        async with self._guard:
            lock = self._locks.get(resolved)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[resolved] = lock
        async with lock:
            yield
