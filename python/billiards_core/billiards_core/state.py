"""Validation and normalization for vision-provided ball coordinates.

This module intentionally does not infer ball radius, pocket geometry, ball role,
or the physical meaning of the positive coordinate directions.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from math import isfinite
from typing import Any, Optional


SCHEMA_VERSION = "0.1.0"
MAX_BALL_ID = 15
MAX_BALL_COUNT = 16


class ObservationValidationError(ValueError):
    """Raised when a visual ball observation cannot become a table state."""


@dataclass(frozen=True)
class TableGeometry:
    """Active table dimensions in millimeters."""

    active_length_mm: float = 2540.0
    active_width_mm: float = 1270.0

    def __post_init__(self) -> None:
        for field_name, value in (
            ("active_length_mm", self.active_length_mm),
            ("active_width_mm", self.active_width_mm),
        ):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError("{} must be a finite positive number".format(field_name))
            if not isfinite(value) or value <= 0:
                raise ValueError("{} must be a finite positive number".format(field_name))

    def contains(self, x_mm: float, y_mm: float) -> bool:
        """Return whether a point lies inside the active table rectangle.

        This checks the table surface rectangle only. It does not apply a ball
        radius margin because the ball radius has not yet been confirmed.
        """
        return (
            -self.active_width_mm / 2 <= x_mm <= self.active_width_mm / 2
            and -self.active_length_mm / 2 <= y_mm <= self.active_length_mm / 2
        )


def _finite_number(value: Any, field_name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ObservationValidationError("{} must be a number".format(field_name))
    if not isfinite(value):
        raise ObservationValidationError("{} must be finite".format(field_name))
    return float(value)


def build_table_state(
    raw_balls: Sequence[Mapping[str, Any]],
    *,
    table_id: str,
    state_version: int,
    source: str = "vision-provider",
    geometry: Optional[TableGeometry] = None,
) -> dict[str, Any]:
    """Validate raw vision detections and build the initial normalized state.

    Assumptions for this first contract version:
    - input x/y are millimeters;
    - the origin is the table center;
    - x follows table width and y follows table length;
    - positive axis directions are preserved from the vision source.

    Ball IDs are treated only as source identifiers. No cue-ball or group
    semantics are inferred. The output is sorted by ID for deterministic JSON.
    """
    if not isinstance(table_id, str) or not table_id.strip():
        raise ObservationValidationError("table_id must be a non-empty string")
    if isinstance(state_version, bool) or not isinstance(state_version, int) or state_version < 1:
        raise ObservationValidationError("state_version must be a positive integer")
    if not isinstance(source, str) or not source.strip():
        raise ObservationValidationError("source must be a non-empty string")

    if not isinstance(raw_balls, Sequence) or isinstance(raw_balls, (str, bytes, bytearray)):
        raise ObservationValidationError("raw_balls must be a sequence of ball objects")
    if not 1 <= len(raw_balls) <= MAX_BALL_COUNT:
        raise ObservationValidationError("raw_balls must contain between 1 and 16 balls")

    table_geometry = geometry if geometry is not None else TableGeometry()
    seen_ids: set[int] = set()
    normalized_balls: list[dict[str, Any]] = []
    allowed_fields = {"id", "x", "y", "confidence"}

    for index, raw_ball in enumerate(raw_balls):
        if not isinstance(raw_ball, Mapping):
            raise ObservationValidationError("ball at index {} must be an object".format(index))

        extra_fields = set(raw_ball.keys()) - allowed_fields
        if extra_fields:
            raise ObservationValidationError(
                "ball at index {} has unsupported fields: {}".format(
                    index, ", ".join(sorted(str(field) for field in extra_fields))
                )
            )

        ball_id = raw_ball.get("id")
        if isinstance(ball_id, bool) or not isinstance(ball_id, int):
            raise ObservationValidationError("ball id at index {} must be an integer".format(index))
        if not 0 <= ball_id <= MAX_BALL_ID:
            raise ObservationValidationError("ball id {} is outside the supported range 0..15".format(ball_id))
        if ball_id in seen_ids:
            raise ObservationValidationError("duplicate ball id: {}".format(ball_id))
        seen_ids.add(ball_id)

        if "x" not in raw_ball or "y" not in raw_ball:
            raise ObservationValidationError("ball {} must include x and y".format(ball_id))
        x_mm = _finite_number(raw_ball["x"], "ball {} x".format(ball_id))
        y_mm = _finite_number(raw_ball["y"], "ball {} y".format(ball_id))

        if not table_geometry.contains(x_mm, y_mm):
            raise ObservationValidationError(
                "ball {} is outside active table bounds: x={} mm, y={} mm".format(
                    ball_id, x_mm, y_mm
                )
            )

        ball_state: dict[str, Any] = {
            "id": ball_id,
            "x_mm": x_mm,
            "y_mm": y_mm,
        }
        if "confidence" in raw_ball:
            confidence = _finite_number(
                raw_ball["confidence"], "ball {} confidence".format(ball_id)
            )
            if not 0.0 <= confidence <= 1.0:
                raise ObservationValidationError(
                    "ball {} confidence must be in the inclusive range [0, 1]".format(ball_id)
                )
            ball_state["confidence"] = confidence

        normalized_balls.append(ball_state)

    normalized_balls.sort(key=lambda ball: ball["id"])

    return {
        "schema_version": SCHEMA_VERSION,
        "table_id": table_id.strip(),
        "state_version": state_version,
        "source": source.strip(),
        "coordinate_frame": {
            "units": "mm",
            "origin": "table_center",
            "x_axis": "table_width",
            "y_axis": "table_length",
            "positive_x": "inherited_from_vision",
            "positive_y": "inherited_from_vision",
            "orientation_status": "provisional",
        },
        "table_geometry": {
            "active_length_mm": float(table_geometry.active_length_mm),
            "active_width_mm": float(table_geometry.active_width_mm),
        },
        "balls": normalized_balls,
    }
