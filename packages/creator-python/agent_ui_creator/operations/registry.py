from __future__ import annotations

from collections.abc import Mapping

from .models import ProductizedOperationKind
from .playbooks import ProductizedOperationPlaybook


class CreatorOperationRegistry:
    """Thin mapping from an executable operation kind to its Playbook."""

    _SUPPORTED = frozenset(
        {"add_existing_plugin", "remove_plugin", "move_plugin"}
    )

    def __init__(
        self,
        playbooks: Mapping[str, ProductizedOperationPlaybook] | None = None,
    ) -> None:
        self._playbooks = {
            operation: playbook
            for operation, playbook in (playbooks or {}).items()
            if operation in self._SUPPORTED
        }

    def get(self, operation: str) -> ProductizedOperationPlaybook | None:
        """Return only an explicitly registered Productized Playbook."""

        return self._playbooks.get(operation)

    def register(
        self,
        operation: ProductizedOperationKind,
        playbook: ProductizedOperationPlaybook,
    ) -> None:
        """Register one executable operation without adding routing policy."""

        self._playbooks[operation] = playbook

    def contains(self, operation: str) -> bool:
        return operation in self._playbooks

    def operations(self) -> tuple[str, ...]:
        return tuple(sorted(self._playbooks))
