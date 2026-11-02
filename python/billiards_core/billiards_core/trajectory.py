"""Validation for shot trajectory records shared across app boundaries."""

from collections.abc import Mapping
from math import isfinite
from typing import Any


SCHEMA_VERSION = "0.1.0"
MAX_SAFE_INTEGER = 9_007_199_254_740_991
MAX_BALL_ID = 15
MAX_BALL_COUNT = 16


class TrajectoryValidationError(ValueError):
    """Raised when a trajectory record violates the shared v0.1.0 contract."""


def _record(
    value: Any,
    name: str,
    required: set[str],
    allowed: set[str],
) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise TrajectoryValidationError("{} must be an object".format(name))
    missing = required - set(value)
    if missing:
        raise TrajectoryValidationError(
            "{} is missing required fields: {}".format(name, ", ".join(sorted(missing)))
        )
    extra = set(value) - allowed
    if extra:
        raise TrajectoryValidationError(
            "{} has unsupported fields: {}".format(name, ", ".join(sorted(extra)))
        )
    return value


def _string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise TrajectoryValidationError("{} must be a non-empty string".format(name))
    return value


def _number(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TrajectoryValidationError("{} must be a number".format(name))
    if not isfinite(value):
        raise TrajectoryValidationError("{} must be finite".format(name))
    return float(value)


def _integer(value: Any, name: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TrajectoryValidationError("{} must be an integer".format(name))
    if not minimum <= value <= MAX_SAFE_INTEGER:
        raise TrajectoryValidationError(
            "{} must be a safe integer greater than or equal to {}".format(name, minimum)
        )
    return value


def validate_trajectory_record(value: Any) -> None:
    """Validate trajectory metadata, time ordering, IDs, and active-table bounds.

    The function validates but does not mutate or normalize the caller's object.
    Frame-index gaps are allowed; timestamps are actual nanoseconds relative to
    shot start and must not be reconstructed from nominal FPS.
    """
    required = {
        "schema_version", "trajectory_id", "match_id", "rack_id", "shot_id",
        "table_id", "state_version", "source", "timebase", "coordinate_frame",
        "table_geometry", "frames", "provenance",
    }
    schema = _record(value, "trajectory", required, required)
    if schema["schema_version"] != SCHEMA_VERSION:
        raise TrajectoryValidationError("unsupported schema_version")
    for field in ("trajectory_id", "match_id", "rack_id", "shot_id", "table_id", "source"):
        _string(schema[field], field)
    _integer(schema["state_version"], "state_version", minimum=1)

    timebase = _record(
        schema["timebase"],
        "timebase",
        {"timestamp_unit", "timestamp_origin", "nominal_fps"},
        {"timestamp_unit", "timestamp_origin", "nominal_fps"},
    )
    if timebase["timestamp_unit"] != "ns":
        raise TrajectoryValidationError("timebase.timestamp_unit must be ns")
    if timebase["timestamp_origin"] != "shot_start":
        raise TrajectoryValidationError("timebase.timestamp_origin must be shot_start")
    nominal_fps = _number(timebase["nominal_fps"], "timebase.nominal_fps")
    if not 0 < nominal_fps <= 1000:
        raise TrajectoryValidationError("timebase.nominal_fps must be in (0, 1000]")

    coordinate_frame = _record(
        schema["coordinate_frame"],
        "coordinate_frame",
        {
            "units", "origin", "x_axis", "y_axis", "positive_x", "positive_y",
            "orientation_status",
        },
        {
            "units", "origin", "x_axis", "y_axis", "positive_x", "positive_y",
            "orientation_status",
        },
    )
    expected_frame = {
        "units": "mm",
        "origin": "table_center",
        "x_axis": "table_width",
        "y_axis": "table_length",
        "positive_x": "inherited_from_vision",
        "positive_y": "inherited_from_vision",
        "orientation_status": "provisional",
    }
    if dict(coordinate_frame) != expected_frame:
        raise TrajectoryValidationError("coordinate_frame does not match the v0.1.0 contract")

    geometry = _record(
        schema["table_geometry"],
        "table_geometry",
        {"active_length_mm", "active_width_mm"},
        {"active_length_mm", "active_width_mm"},
    )
    length = _number(geometry["active_length_mm"], "table_geometry.active_length_mm")
    width = _number(geometry["active_width_mm"], "table_geometry.active_width_mm")
    if length <= 0 or width <= 0:
        raise TrajectoryValidationError("table geometry dimensions must be positive")

    frames = schema["frames"]
    if not isinstance(frames, list) or not 2 <= len(frames) <= 10_000:
        raise TrajectoryValidationError("frames must contain between 2 and 10000 frames")
    previous_index = -1
    previous_timestamp = -1
    for position, raw_frame in enumerate(frames):
        name = "frames[{}]".format(position)
        frame = _record(
            raw_frame,
            name,
            {"frame_index", "timestamp_ns", "balls"},
            {"frame_index", "timestamp_ns", "balls"},
        )
        frame_index = _integer(frame["frame_index"], name + ".frame_index")
        timestamp = _integer(frame["timestamp_ns"], name + ".timestamp_ns")
        if position == 0 and frame_index != 0:
            raise TrajectoryValidationError("first frame_index must be 0")
        if position == 0 and timestamp != 0:
            raise TrajectoryValidationError("first timestamp_ns must be 0")
        if frame_index <= previous_index:
            raise TrajectoryValidationError("frame_index must be strictly increasing")
        if timestamp <= previous_timestamp:
            raise TrajectoryValidationError("timestamp_ns must be strictly increasing")

        balls = frame["balls"]
        if not isinstance(balls, list) or not 1 <= len(balls) <= MAX_BALL_COUNT:
            raise TrajectoryValidationError(name + ".balls must contain 1 to 16 detections")
        seen_ids: set[int] = set()
        for ball_position, raw_ball in enumerate(balls):
            ball_name = "{}.balls[{}]".format(name, ball_position)
            ball = _record(
                raw_ball,
                ball_name,
                {"id", "x_mm", "y_mm"},
                {"id", "x_mm", "y_mm", "confidence"},
            )
            ball_id = _integer(ball["id"], ball_name + ".id")
            if ball_id > MAX_BALL_ID:
                raise TrajectoryValidationError(ball_name + ".id must be in 0..15")
            if ball_id in seen_ids:
                raise TrajectoryValidationError(name + " contains duplicate detection IDs")
            seen_ids.add(ball_id)
            x = _number(ball["x_mm"], ball_name + ".x_mm")
            y = _number(ball["y_mm"], ball_name + ".y_mm")
            if not -width / 2 <= x <= width / 2 or not -length / 2 <= y <= length / 2:
                raise TrajectoryValidationError(ball_name + " is outside active table bounds")
            if "confidence" in ball:
                confidence = _number(ball["confidence"], ball_name + ".confidence")
                if not 0 <= confidence <= 1:
                    raise TrajectoryValidationError(ball_name + ".confidence must be in [0, 1]")
        previous_index = frame_index
        previous_timestamp = timestamp

    provenance = _record(
        schema["provenance"],
        "provenance",
        {"kind", "description"},
        {"kind", "description"},
    )
    if provenance["kind"] not in ("synthetic", "project-provided"):
        raise TrajectoryValidationError("provenance.kind is unsupported")
    _string(provenance["description"], "provenance.description")
