"""M2.3: validated boundary for a future Pooltool 0.6.0 bridge.

The bridge must be implemented only after local official-API verification.
This module deliberately does NOT fabricate trajectories or physics.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Protocol

from .simulator import BallPose, ShotAction, SimulationInput, SimulationResult


@dataclass(frozen=True)
class EngineBall:
    ball_id: int
    x_m: float
    y_m: float


@dataclass(frozen=True)
class EngineShot:
    angle_deg: float
    speed_m_s: float
    tip_offset_x: float
    tip_offset_y: float


class PooltoolBridge(Protocol):
    """Bridge implementers must document verified Pooltool API and axis mapping."""
    def run(
        self, balls: tuple[EngineBall, ...], shot: EngineShot
    ) -> SimulationResult: ...


class PooltoolAdapter:
    """Translate units and delegate; no Pooltool dependency at import time."""

    def __init__(self, bridge: PooltoolBridge | None = None) -> None:
        self._bridge = bridge

    def simulate(self, request: SimulationInput) -> SimulationResult:
        if self._bridge is None:
            raise RuntimeError(
                "Pooltool bridge is not configured; verify M2.2 and "
                "implement the version-checked bridge before simulation"
            )
        if not isinstance(request, SimulationInput):
            raise TypeError("request must be SimulationInput")
        balls = tuple(
            EngineBall(ball.ball_id, ball.x_mm / 1000.0, ball.y_mm / 1000.0)
            for ball in request.balls
        )
        shot = EngineShot(
            request.action.angle_deg,
            request.action.speed_m_s,
            request.action.tip_offset_x,
            request.action.tip_offset_y,
        )
        result = self._bridge.run(balls, shot)
        if not isinstance(result, SimulationResult):
            raise TypeError("bridge must return SimulationResult")
        expected = {ball.ball_id for ball in request.balls}
        if {ball.ball_id for ball in result.frames[0].balls} != expected:
            raise ValueError("bridge initial frame IDs do not match input")
        for frame in result.frames:
            if not {ball.ball_id for ball in frame.balls}.issubset(expected):
                raise ValueError("bridge returned unknown ball ID")
        return result
