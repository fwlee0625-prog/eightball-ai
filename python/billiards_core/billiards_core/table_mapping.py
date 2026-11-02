"""M2.4 table coordinates and nominal pocket identifiers.

Nominal pocket positions are visual anchors on the active-surface boundary,
NOT measured pocket centres, jaws, collision cushions or pocket openings.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from .state import TableGeometry

POCKET_LABELS = (
    (1, "top_left"),
    (2, "top_right"),
    (3, "right_middle"),
    (4, "bottom_right"),
    (5, "bottom_left"),
    (6, "left_middle"),
)


@dataclass(frozen=True)
class PocketAnchor:
    pocket_id: int
    label: str
    x_mm: float
    y_mm: float
    calibrated: bool = False


@dataclass(frozen=True)
class TableMapping:
    """Project business coordinates: origin centre, +X right, +Y up."""

    geometry: TableGeometry = TableGeometry()

    @property
    def half_width_mm(self) -> float:
        return self.geometry.active_width_mm / 2

    @property
    def half_length_mm(self) -> float:
        return self.geometry.active_length_mm / 2

    def to_normalized(self, x_mm: float, y_mm: float) -> tuple[float, float]:
        """Map active-surface rectangle to [-1,1]²; does not clip."""
        self._check_finite(x_mm, y_mm)
        return x_mm / self.half_width_mm, y_mm / self.half_length_mm

    def from_normalized(self, x_norm: float, y_norm: float) -> tuple[float, float]:
        self._check_finite(x_norm, y_norm)
        return x_norm * self.half_width_mm, y_norm * self.half_length_mm

    def to_engine_metres(self, x_mm: float, y_mm: float) -> tuple[float, float]:
        """Unit conversion only; not a Pooltool axis/origin transform."""
        self._check_finite(x_mm, y_mm)
        return x_mm / 1000, y_mm / 1000

    def nominal_pocket_anchors(self) -> tuple[PocketAnchor, ...]:
        """Six labeled boundary anchors for UI/tests, NOT physical pockets."""
        w, l = self.half_width_mm, self.half_length_mm
        positions = ((-w, l), (w, l), (w, 0), (w, -l), (-w, -l), (-w, 0))
        return tuple(
            PocketAnchor(pocket_id, label, x, y)
            for (pocket_id, label), (x, y) in zip(POCKET_LABELS, positions)
        )

    def validate_ball_centre(self, x_mm: float, y_mm: float) -> None:
        """Only rectangle check; ball radius and pocket geometry are unverified."""
        self._check_finite(x_mm, y_mm)
        if not self.geometry.contains(x_mm, y_mm):
            raise ValueError("ball centre outside active table rectangle")

    @staticmethod
    def _check_finite(x: float, y: float) -> None:
        if isinstance(x, bool) or isinstance(y, bool):
            raise ValueError("coordinates must be finite numbers")
        try:
            valid = isfinite(x) and isfinite(y)
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValueError("coordinates must be finite numbers") from exc
        if not valid:
            raise ValueError("coordinates must be finite numbers")
