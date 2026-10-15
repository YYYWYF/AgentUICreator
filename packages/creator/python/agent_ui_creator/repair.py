from __future__ import annotations


MAX_AUTOMATIC_REPAIR_ROUNDS = 2


class CreatorRepairState:
    def __init__(self) -> None:
        self.repair_rounds = 0
        self._failed_revision: int | None = None

    def begin_verification(self, revision: int) -> None:
        if self._failed_revision is not None and revision > self._failed_revision:
            self.repair_rounds += 1
            self._failed_revision = None

    def record_result(self, revision: int, *, passed: bool) -> None:
        self._failed_revision = None if passed else revision

    @property
    def limit_reached(self) -> bool:
        return (
            self.repair_rounds >= MAX_AUTOMATIC_REPAIR_ROUNDS
            and self._failed_revision is not None
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "repairRounds": self.repair_rounds,
            "maxRepairRounds": MAX_AUTOMATIC_REPAIR_ROUNDS,
            "repairLimitReached": self.limit_reached,
        }
