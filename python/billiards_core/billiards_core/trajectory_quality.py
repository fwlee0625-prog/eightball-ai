"""Read-only, deterministic diagnostics for v0.1.0 observed shot trajectories."""

from collections.abc import Mapping
from math import hypot, isfinite
from typing import Any

from .trajectory import validate_trajectory_record

REPORT_VERSION = "0.1.0"
MAX_EXAMPLES = 20


def _ratio(value: float, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number in [0, 1]")
    if not isfinite(value) or not 0 <= value <= 1:
        raise ValueError(f"{name} must be a finite number in [0, 1]")
    return float(value)


def _measured_diameter(value: float | None, width: float, length: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("ball_diameter_mm must be a positive finite number")
    if not isfinite(value) or not 0 < value <= min(width, length):
        raise ValueError("ball_diameter_mm must be positive and fit inside the table")
    return float(value)


def analyze_trajectory_quality(
    record: Mapping[str, Any],
    *,
    low_confidence_threshold: float = 0.5,
    nominal_timing_tolerance: float = 0.25,
    ball_diameter_mm: float | None = None,
) -> dict[str, Any]:
    """Report observation quality; do not infer pocketing, ball numbers or camera FPS.

    Source index gaps are unrecorded indexes, not verified camera frame drops.
    Missing detections are relative to IDs observed anywhere in this shot,
    not proof of tracking loss or pocketing. Actual timestamp_ns stays authoritative.
    XY overlap requires an explicitly supplied measured diameter.
    """
    confidence_threshold = _ratio(low_confidence_threshold, "low_confidence_threshold")
    timing_tolerance = _ratio(nominal_timing_tolerance, "nominal_timing_tolerance")
    validate_trajectory_record(record)
    geometry = record["table_geometry"]
    diameter = _measured_diameter(
        ball_diameter_mm,
        float(geometry["active_width_mm"]),
        float(geometry["active_length_mm"]),
    )
    frames = record["frames"]
    all_ids = sorted({ball["id"] for frame in frames for ball in frame["balls"]})
    reference_ids = set(all_ids)

    total_detections = 0
    confidence_count = 0
    low_confidence_count = 0
    missing_count = 0
    missing_frames = 0
    missing_examples: list[dict[str, Any]] = []
    overlap_count = 0
    overlap_examples: list[dict[str, Any]] = []

    for frame in frames:
        balls = frame["balls"]
        total_detections += len(balls)
        missing_ids = sorted(reference_ids - {ball["id"] for ball in balls})
        if missing_ids:
            missing_count += len(missing_ids)
            missing_frames += 1
            if len(missing_examples) < MAX_EXAMPLES:
                missing_examples.append({
                    "frame_index": frame["frame_index"],
                    "missing_detection_ids": missing_ids,
                })
        for ball in balls:
            if "confidence" in ball:
                confidence_count += 1
                if ball["confidence"] < confidence_threshold:
                    low_confidence_count += 1

        if diameter is not None:
            for left in range(len(balls)):
                for right in range(left + 1, len(balls)):
                    first = balls[left]
                    second = balls[right]
                    if hypot(
                        first["x_mm"] - second["x_mm"],
                        first["y_mm"] - second["y_mm"],
                    ) < diameter:
                        overlap_count += 1
                        if len(overlap_examples) < MAX_EXAMPLES:
                            overlap_examples.append({
                                "frame_index": frame["frame_index"],
                                "detection_ids": sorted((first["id"], second["id"])),
                            })

    gap_intervals = 0
    gap_index_count = 0
    gap_examples: list[dict[str, int]] = []
    timing_outliers = 0
    timing_examples: list[dict[str, Any]] = []
    nominal_interval_ns = 1_000_000_000 / float(record["timebase"]["nominal_fps"])

    for previous, current in zip(frames, frames[1:]):
        index_delta = current["frame_index"] - previous["frame_index"]
        elapsed_ns = current["timestamp_ns"] - previous["timestamp_ns"]
        gap = index_delta - 1
        if gap:
            gap_intervals += 1
            gap_index_count += gap
            if len(gap_examples) < MAX_EXAMPLES:
                gap_examples.append({
                    "previous_frame_index": previous["frame_index"],
                    "next_frame_index": current["frame_index"],
                    "unrecorded_source_indexes": gap,
                })
        deviation = abs(elapsed_ns / index_delta / nominal_interval_ns - 1)
        if deviation > timing_tolerance:
            timing_outliers += 1
            if len(timing_examples) < MAX_EXAMPLES:
                timing_examples.append({
                    "previous_frame_index": previous["frame_index"],
                    "next_frame_index": current["frame_index"],
                    "elapsed_ns": elapsed_ns,
                    "deviation_ratio": round(deviation, 6),
                })

    warnings = []
    for code, count, meaning in (
        ("source_index_gaps", gap_index_count, "Source indexes are not all recorded; capture loss unproven."),
        ("missing_observations", missing_count, "Some previously or subsequently seen IDs are absent; reason unknown."),
        ("low_confidence", low_confidence_count, "Reported detection confidence falls below configured threshold."),
        ("nominal_timing_deviation", timing_outliers, "Recorded timing differs from nominal FPS; timestamps remain authoritative."),
        ("suspected_xy_overlap", overlap_count if diameter is not None else 0, "XY centers are closer than supplied diameter; requires manual confirmation."),
    ):
        if count > 0:
            warnings.append({"code": code, "count": count, "meaning": meaning})

    return {
        "report_version": REPORT_VERSION,
        "trajectory_id": record["trajectory_id"],
        "shot_id": record["shot_id"],
        "input_provenance_kind": record["provenance"]["kind"],
        "frame_count": len(frames),
        "duration_ns": frames[-1]["timestamp_ns"],
        "observed_detection_count": total_detections,
        "observed_detection_ids": all_ids,
        "source_index_gap_intervals": gap_intervals,
        "unrecorded_source_indexes": gap_index_count,
        "source_gap_examples": gap_examples,
        "missing_observation_count": missing_count,
        "frames_with_missing_observations": missing_frames,
        "missing_observation_examples": missing_examples,
        "confidence_observation_count": confidence_count,
        "low_confidence_threshold": confidence_threshold,
        "low_confidence_observation_count": low_confidence_count,
        "nominal_timing_tolerance": timing_tolerance,
        "nominal_timing_outlier_intervals": timing_outliers,
        "nominal_timing_examples": timing_examples,
        "overlap_check": "supplied_diameter" if diameter is not None else "skipped_no_diameter",
        "ball_diameter_mm": diameter,
        "suspected_xy_overlap_count": overlap_count if diameter is not None else None,
        "suspected_xy_overlap_examples": overlap_examples,
        "warning_count": len(warnings),
        "warnings": warnings,
        "limitations": [
            "Tracking IDs are not confirmed cue-ball, group, or ball numbers.",
            "XY geometry and orientation remain provisional until measured.",
            "No frames, ball positions, pocketing, spin or motion states are inferred.",
            "Nominal FPS is metadata; not proof of capture or rendering performance.",
            "Examples are limited to 20 per category; aggregate counts are complete.",
        ],
    }
