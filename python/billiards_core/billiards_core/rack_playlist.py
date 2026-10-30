"""Explicit multi-shot rack playlist validation and read-only summaries."""

from collections.abc import Mapping
from typing import Any

from .trajectory import TrajectoryValidationError, validate_trajectory_record


def validate_rack_playlist(value: Any) -> None:
    """Check explicit shot order; never infer shot boundaries or wall-clock time."""
    if not isinstance(value, Mapping):
        raise TrajectoryValidationError("rack playlist must be an object")
    required = {"schema_version", "match_id", "rack_id", "table_id", "sequence_origin", "shots"}
    if set(value) != required:
        raise TrajectoryValidationError("rack playlist fields do not match the contract")
    if value["schema_version"] != "0.1.0" or value["sequence_origin"] != "manual":
        raise TrajectoryValidationError("rack playlist schema_version/sequence_origin is unsupported")
    for key in ("match_id", "rack_id", "table_id"):
        if not isinstance(value[key], str) or not value[key].strip():
            raise TrajectoryValidationError(f"{key} must be a non-empty string")
    shots = value["shots"]
    if not isinstance(shots, list) or not 2 <= len(shots) <= 100:
        raise TrajectoryValidationError("shots must contain between 2 and 100 shot trajectories")
    seen_shots: set[str] = set()
    seen_trajectories: set[str] = set()
    initial = None
    previous_version = 0
    for index, shot in enumerate(shots):
        validate_trajectory_record(shot)
        if any(shot[key] != value[key] for key in ("match_id", "rack_id", "table_id")):
            raise TrajectoryValidationError(f"shots[{index}] rack identifiers do not match")
        if shot["shot_id"] in seen_shots or shot["trajectory_id"] in seen_trajectories:
            raise TrajectoryValidationError("duplicate shot_id or trajectory_id in rack playlist")
        seen_shots.add(shot["shot_id"])
        seen_trajectories.add(shot["trajectory_id"])
        if shot["state_version"] <= previous_version:
            raise TrajectoryValidationError("shot state_version must be strictly increasing in explicit order")
        previous_version = shot["state_version"]
        same_frame = (shot["coordinate_frame"], shot["table_geometry"])
        if initial is None:
            initial = same_frame
        elif same_frame != initial:
            raise TrajectoryValidationError("rack playlist shots use inconsistent coordinate frame or geometry")


def summarize_rack_playlist(value: Mapping[str, Any]) -> dict[str, Any]:
    """Return JSON-serializable per-shot references without copying frame data."""
    validate_rack_playlist(value)
    return {
        "report_version": "0.1.0",
        "match_id": value["match_id"],
        "rack_id": value["rack_id"],
        "table_id": value["table_id"],
        "sequence_origin": "manual",
        "shot_count": len(value["shots"]),
        "shots": [{
            "order": i + 1,
            "shot_id": shot["shot_id"],
            "trajectory_id": shot["trajectory_id"],
            "state_version": shot["state_version"],
            "frame_count": len(shot["frames"]),
            "duration_ns": shot["frames"][-1]["timestamp_ns"],
            "timestamp_origin": "shot_start",
        } for i, shot in enumerate(value["shots"])],
        "limitations": [
            "Shot order is supplied by the user, not inferred from observed XY motion.",
            "Each shot has an independent nanosecond timebase starting at shot_start; no wall-clock or cross-shot duration is derived.",
            "Strictly increasing state_version tracks snapshots, not verified physical continuity or confirmed strikes.",
            "Tracking IDs and real-world geometry remain provisional.",
        ],
    }
