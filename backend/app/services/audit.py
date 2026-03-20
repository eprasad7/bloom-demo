"""Audit logging — tracks every pipeline step with timestamps and latency."""

import time
from datetime import datetime, timezone

from app.models import AuditEvent, RiskLevel


class AuditLogger:
    """Collects audit events during a single request pipeline."""

    def __init__(self) -> None:
        self.events: list[AuditEvent] = []
        self._timers: dict[str, float] = {}

    def start_timer(self, key: str) -> None:
        self._timers[key] = time.perf_counter()

    def log(
        self,
        event_type: str,
        detail: str,
        risk_level: RiskLevel = RiskLevel.SAFE,
        timer_key: str | None = None,
    ) -> None:
        latency_ms = 0.0
        if timer_key and timer_key in self._timers:
            latency_ms = (time.perf_counter() - self._timers[timer_key]) * 1000

        self.events.append(
            AuditEvent(
                timestamp=datetime.now(timezone.utc).isoformat(),
                event_type=event_type,
                detail=detail,
                risk_level=risk_level,
                latency_ms=round(latency_ms, 1),
            )
        )

    def to_dicts(self) -> list[dict]:
        return [e.model_dump() for e in self.events]
