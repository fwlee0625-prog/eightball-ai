"""M2.1: physics-engine-independent simulation contracts.

Coordinates are millimetres, +X right and +Y up in top view.
No physics model or Pooltool integration is claimed by this module.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Protocol


@dataclass(frozen=True)
class BallPose:
    ball_id: int
    x_mm: float
    y_mm: float

    def __post_init__(self) -> None:
        if type(self.ball_id) is not int or not 0 <= self.ball_id <= 15:
            raise ValueError("ball_id must be an integer from 0 to 15")
        if not all(isfinite(v) for v in (self.x_mm, self.y_mm)):
            raise ValueError("ball coordinates must be finite")


@dataclass(frozen=True)
class ShotAction:
    """Angle in degrees, counterclockwise from +X; speed in m/s.

    tip_offset_x and tip_offset_y are normalized offsets in [-1, 1].
    Exact spin conversion is adapter-specific and requires calibration.
    """
    angle_deg: float
    speed_m_s: float
    tip_offset_x: float = 0.0
    tip_offset_y: float = 0.0

    def __post_init__(self) -> None:
        values = (self.angle_deg, self.speed_m_s, self.tip_offset_x, self.tip_offset_y)
        if not all(isfinite(v) for v in values):
            raise ValueError("action parameters must be finite")
        if self.speed_m_s <= 0:
            raise ValueError("speed_m_s must be positive")
        if abs(self.tip_offset_x) > 1 or abs(self.tip_offset_y) > 1:
            raise ValueError("tip offsets must be in [-1, 1]")
        if self.tip_offset_x ** 2 + self.tip_offset_y ** 2 > 1:
            raise ValueError("tip offset must lie within unit disk")


@dataclass(frozen=True)
class SimulationInput:
    balls: tuple[BallPose, ...]
    action: ShotAction

    def __post_init__(self) -> None:
        ids = [ball.ball_id for ball in self.balls]
        if not ids or 0 not in ids:
            raise ValueError("a cue ball (id=0) is required")
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate ball IDs")


@dataclass(frozen=True)
class TrajectoryFrame:
    time_s: float
    balls: tuple[BallPose, ...]

    def __post_init__(self) -> None:
        if not isfinite(self.time_s) or self.time_s < 0:
            raise ValueError("frame time must be nonnegative and finite")
        ids = [ball.ball_id for ball in self.balls]
        if len(ids) != len(set(ids)):
            raise ValueError("duplicate ball IDs in frame")


@dataclass(frozen=True)
class SimulationEvent:
    time_s: float
    event_type: str
    ball_ids: tuple[int, ...]

    def __post_init__(self) -> None:
        if not isfinite(self.time_s) or self.time_s < 0:
            raise ValueError("event time must be nonnegative and finite")
        if not self.event_type:
            raise ValueError("event_type is required")
        if len(self.ball_ids) != len(set(self.ball_ids)):
            raise ValueError("duplicate event ball IDs")
        if any(type(i) is not int or not 0 <= i <= 15 for i in self.ball_ids):
            raise ValueError("invalid event ball ID")


@dataclass(frozen=True)
class SimulationResult:
    frames: tuple[TrajectoryFrame, ...]
    events: tuple[SimulationEvent, ...]
    elapsed_ms: float

    def __post_init__(self) -> None:
        if not isfinite(self.elapsed_ms) or self.elapsed_ms < 0:
            raise ValueError("elapsed_ms must be nonnegative and finite")
        if not self.frames or self.frames[0].time_s != 0:
            raise ValueError("frames must begin at t=0")
        if any(a.time_s >= b.time_s for a, b in zip(self.frames, self.frames[1:])):
            raise ValueError("frame times must increase strictly")
        if any(a.time_s > b.time_s for a, b in zip(self.events, self.events[1:])):
            raise ValueError("event times must be nondecreasing")
        if any(event.time_s > self.frames[-1].time_s for event in self.events):
            raise ValueError("events cannot occur after the last frame")


class Simulator(Protocol):
    def simulate(self, request: SimulationInput) -> SimulationResult:
        """Run a simulation; implementation must document its physics assumptions."""
        ...
