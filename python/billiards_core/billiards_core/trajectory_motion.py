"""Conservative, read-only XY motion diagnostics; never asserts a real cue strike."""

from collections.abc import Mapping
from math import hypot, isfinite
from typing import Any

from .trajectory import validate_trajectory_record

MOTION_REPORT_VERSION = "0.1.0"


def _positive(value: float, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a positive finite number")
    if not isfinite(value) or value <= 0:
        raise ValueError(f"{label} must be a positive finite number")
    return float(value)


def analyze_trajectory_motion(
    record: Mapping[str, Any],
    *,
    stationary_speed_mm_s: float = 2.0,
    moving_speed_mm_s: float = 20.0,
    min_run_intervals: int = 2,
    min_confidence: float = 0.5,
) -> dict[str, Any]:
    """Classify only neighboring source frames with identical, reliable observed IDs.

    Incomplete ID sets, nonconsecutive original frame indexes and supplied low
    confidence return unknown, not a guessed static/moving state. Confidence
    absent from the input remains unknown as a *quality signal*, not fabricated.
    Boundary windows are change candidates, never confirmed hit timestamps.
    """
    stationary = _positive(stationary_speed_mm_s, "stationary_speed_mm_s")
    moving = _positive(moving_speed_mm_s, "moving_speed_mm_s")
    if moving <= stationary:
        raise ValueError("moving_speed_mm_s must exceed stationary_speed_mm_s")
    if isinstance(min_run_intervals, bool) or not isinstance(min_run_intervals, int) or not 1 <= min_run_intervals <= 1000:
        raise ValueError("min_run_intervals must be an integer in [1, 1000]")
    if isinstance(min_confidence, bool) or not isinstance(min_confidence, (int, float)) or not isfinite(min_confidence) or not 0 <= min_confidence <= 1:
        raise ValueError("min_confidence must be a finite number in [0, 1]")
    validate_trajectory_record(record)
    frames = record["frames"]
    observed_ids = {ball["id"] for frame in frames for ball in frame["balls"]}
    intervals: list[dict[str, Any]] = []

    for before, after in zip(frames, frames[1:]):
        first = {ball["id"]: ball for ball in before["balls"]}
        second = {ball["id"]: ball for ball in after["balls"]}
        interval: dict[str, Any] = {
            "from_frame_index": before["frame_index"],
            "to_frame_index": after["frame_index"],
            "start_ns": before["timestamp_ns"],
            "end_ns": after["timestamp_ns"],
            "state": "unknown",
            "reason": None,
            "max_displacement_mm": None,
            "max_speed_mm_s": None,
        }
        if after["frame_index"] - before["frame_index"] != 1:
            interval["reason"] = "source_index_gap"
        elif set(first) != set(second) or set(first) != observed_ids:
            interval["reason"] = "incomplete_observations"
        elif any(
            ball.get("confidence", 1.0) < min_confidence
            for ball in (*before["balls"], *after["balls"])
        ):
            interval["reason"] = "low_confidence"
        else:
            elapsed_seconds = (after["timestamp_ns"] - before["timestamp_ns"]) / 1_000_000_000
            max_displacement = max(
                hypot(first[id_]["x_mm"] - second[id_]["x_mm"], first[id_]["y_mm"] - second[id_]["y_mm"])
                for id_ in sorted(observed_ids)
            )
            max_speed = max_displacement / elapsed_seconds
            interval["max_displacement_mm"] = round(max_displacement, 9)
            interval["max_speed_mm_s"] = round(max_speed, 9)
            if max_speed <= stationary:
                interval["state"] = "stationary"
            elif max_speed >= moving:
                interval["state"] = "moving"
            else:
                interval["reason"] = "threshold_ambiguity"
        intervals.append(interval)

    runs: list[dict[str, Any]] = []
    for interval_index, item in enumerate(intervals):
        if runs and runs[-1]["state"] == item["state"] and item["state"] != "unknown":
            runs[-1]["end_interval"] = interval_index
            runs[-1]["interval_count"] += 1
        else:
            runs.append({
                "state": item["state"],
                "start_interval": interval_index,
                "end_interval": interval_index,
                "interval_count": 1,
            })

    candidates: list[dict[str, Any]] = []
    for previous_run, next_run in zip(runs, runs[1:]):
        if previous_run["interval_count"] < min_run_intervals or next_run["interval_count"] < min_run_intervals:
            continue
        if (previous_run["state"], next_run["state"]) not in (
            ("stationary", "moving"), ("moving", "stationary")
        ):
            continue
        item = intervals[next_run["start_interval"]]
        candidates.append({
            "kind": "motion_start_candidate" if next_run["state"] == "moving" else "motion_stop_candidate",
            "from_frame_index": item["from_frame_index"],
            "to_frame_index": item["to_frame_index"],
            "window_start_ns": item["start_ns"],
            "window_end_ns": item["end_ns"],
        })

    return {
        "report_version": MOTION_REPORT_VERSION,
        "trajectory_id": record["trajectory_id"],
        "shot_id": record["shot_id"],
        "stationary_speed_mm_s": stationary,
        "moving_speed_mm_s": moving,
        "min_run_intervals": min_run_intervals,
        "min_confidence": float(min_confidence),
        "interval_count": len(intervals),
        "stationary_interval_count": sum(item["state"] == "stationary" for item in intervals),
        "moving_interval_count": sum(item["state"] == "moving" for item in intervals),
        "unknown_interval_count": sum(item["state"] == "unknown" for item in intervals),
        "intervals": intervals,
        "boundary_candidates": candidates,
        "limitations": [
            "These are XY observation-state candidates, NOT verified cue strikes or shot boundaries.",
            "Source-index gaps, missing IDs and low confidence are unknown, never assumed stationary.",
            "Thresholds are configurable diagnostics, not calibrated physics or proven noise levels.",
            "Tracking IDs do not identify cue ball or canonical ball numbers.",
            "A continuous ID does not prove stable object identity across tracker switches.",
            "No spin, impact, pocketing or motion between observed frames is inferred.",
            "Coordinate direction and real-world geometry remain uncalibrated.",
        ],
    }
