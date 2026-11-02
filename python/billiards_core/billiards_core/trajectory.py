"""M2.5: deterministic, validated trajectory export for visualization.

This module only transforms simulation output. It does not simulate physics.
"""
from __future__ import annotations

from math import isfinite
from typing import Any

from .simulator import SimulationResult

TRAJECTORY_SCHEMA_VERSION = "0.1.0"


def export_trajectory(result: SimulationResult) -> dict[str, Any]:
    """Export frames/events as JSON-compatible data; coordinates remain in mm."""
    if not isinstance(result, SimulationResult):
        raise TypeError("result must be SimulationResult")

    initial_ids = {ball.ball_id for ball in result.frames[0].balls}
    last_seen = initial_ids.copy()
    frames: list[dict[str, Any]] = []
    for frame in result.frames:
        ids = {ball.ball_id for ball in frame.balls}
        if not ids.issubset(initial_ids):
            raise ValueError("trajectory contains unknown ball ID")
        if not ids.issubset(last_seen):
            raise ValueError("ball reappeared after disappearing")
        last_seen = ids
        frames.append({
            "time_s": frame.time_s,
            "balls": [
                {"id": ball.ball_id, "x_mm": ball.x_mm, "y_mm": ball.y_mm}
                for ball in sorted(frame.balls, key=lambda ball: ball.ball_id)
            ],
        })

    end_time = result.frames[-1].time_s
    events: list[dict[str, Any]] = []
    for event in result.events:
        if event.time_s > end_time:
            raise ValueError("event after trajectory end")
        if not set(event.ball_ids).issubset(initial_ids):
            raise ValueError("event references unknown ball ID")
        events.append({
            "time_s": event.time_s,
            "type": event.event_type,
            "ball_ids": list(event.ball_ids),
        })

    return {
        "schema_version": TRAJECTORY_SCHEMA_VERSION,
        "coordinate_frame": {
            "units": "mm",
            "origin": "table_center",
            "positive_x": "right",
            "positive_y": "up",
        },
        "duration_s": end_time,
        "elapsed_ms": result.elapsed_ms,
        "frames": frames,
        "events": events,
    }


def sample_frame_at(result: SimulationResult, time_s: float) -> dict[str, Any]:
    """Return latest recorded frame at/before time_s; no interpolation."""
    if not isinstance(result, SimulationResult):
        raise TypeError("result must be SimulationResult")
    if isinstance(time_s, bool) or not isinstance(time_s, (int, float)) or not isfinite(time_s):
        raise ValueError("time_s must be finite")
    if time_s < 0 or time_s > result.frames[-1].time_s:
        raise ValueError("time_s outside trajectory range")
    chosen = result.frames[0]
    for frame in result.frames[1:]:
        if frame.time_s > time_s:
            break
        chosen = frame
    return {
        "time_s": chosen.time_s,
        "balls": [
            {"id": b.ball_id, "x_mm": b.x_mm, "y_mm": b.y_mm}
            for b in sorted(chosen.balls, key=lambda b: b.ball_id)
        ],
    }
