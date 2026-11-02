"""Explicit landmark-based 2D affine preview; NOT verified physical calibration."""

from collections.abc import Mapping
from math import hypot, isfinite, sqrt
from typing import Any


def _positive(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a positive finite number")
    return float(value)


def _finite(value: Any, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def _object(value: Any, fields: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{name} fields do not match calibration contract")
    return value


def validate_calibration_profile(value: Any) -> None:
    fields = {
        "schema_version", "profile_id", "table_id", "source_kind", "active_length_mm",
        "active_width_mm", "orientation_status", "ball_diameter_mm",
        "pocket_centers_mm", "landmarks",
    }
    profile = _object(value, fields, "profile")
    if profile["schema_version"] != "0.1.0" or profile["orientation_status"] != "provisional":
        raise ValueError("only provisional calibration profile v0.1.0 is supported")
    if profile["source_kind"] not in ("synthetic", "project-provided"):
        raise ValueError("unsupported source_kind")
    for key in ("profile_id", "table_id"):
        if not isinstance(profile[key], str) or not profile[key].strip():
            raise ValueError(f"{key} must be non-empty")
    length = _positive(profile["active_length_mm"], "active_length_mm")
    width = _positive(profile["active_width_mm"], "active_width_mm")
    diameter = profile["ball_diameter_mm"]
    if diameter is not None and _positive(diameter, "ball_diameter_mm") > min(length, width):
        raise ValueError("ball_diameter_mm exceeds table width")
    pockets = profile["pocket_centers_mm"]
    if not isinstance(pockets, list) or len(pockets) not in (0, 6):
        raise ValueError("pocket_centers_mm must have zero or six explicitly supplied pockets")
    pocket_ids: set[str] = set()
    for i, raw in enumerate(pockets):
        pocket = _object(raw, {"id", "x_mm", "y_mm"}, f"pocket_centers_mm[{i}]")
        if not isinstance(pocket["id"], str) or not pocket["id"].strip() or pocket["id"] in pocket_ids:
            raise ValueError("pocket ID must be unique non-empty text")
        pocket_ids.add(pocket["id"])
        x = _finite(pocket["x_mm"], "pocket.x_mm")
        y = _finite(pocket["y_mm"], "pocket.y_mm")
        if abs(x) > width / 2 or abs(y) > length / 2:
            raise ValueError("pocket center outside active rectangle")
    landmarks = profile["landmarks"]
    if not isinstance(landmarks, list) or not 3 <= len(landmarks) <= 32:
        raise ValueError("landmarks must contain between 3 and 32 point pairs")
    seen_pixels: set[tuple[float, float]] = set()
    for i, raw in enumerate(landmarks):
        point = _object(raw, {"pixel_x", "pixel_y", "x_mm", "y_mm"}, f"landmarks[{i}]")
        for field in ("pixel_x", "pixel_y", "x_mm", "y_mm"):
            _finite(point[field], f"landmarks[{i}].{field}")
        pixel = (float(point["pixel_x"]), float(point["pixel_y"]))
        if pixel in seen_pixels:
            raise ValueError("duplicate pixel landmark")
        seen_pixels.add(pixel)
        if abs(point["x_mm"]) > width / 2 or abs(point["y_mm"]) > length / 2:
            raise ValueError("landmark lies outside active table")


def _solve(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Tiny 3×3 pivoted linear solve; no third-party linear-algebra dependency."""
    a = [row[:] + [value] for row, value in zip(matrix, rhs)]
    for pivot in range(3):
        best = max(range(pivot, 3), key=lambda i: abs(a[i][pivot]))
        if abs(a[best][pivot]) < 1e-12:
            raise ValueError("calibration landmarks are degenerate or collinear")
        a[pivot], a[best] = a[best], a[pivot]
        factor = a[pivot][pivot]
        for k in range(pivot, 4):
            a[pivot][k] /= factor
        for other in range(3):
            if other == pivot:
                continue
            factor = a[other][pivot]
            for k in range(pivot, 4):
                a[other][k] -= factor * a[pivot][k]
    return [a[i][3] for i in range(3)]


def fit_affine_preview(profile: Mapping[str, Any]) -> dict[str, Any]:
    """Fit pixel to provisional table-mm mapping; residuals are only in-sample."""
    validate_calibration_profile(profile)
    points = profile["landmarks"]
    rows = [(float(p["pixel_x"]), float(p["pixel_y"]), 1.0) for p in points]
    matrix = [[sum(row[i] * row[j] for row in rows) for j in range(3)] for i in range(3)]
    x = _solve(matrix, [sum(row[i] * point["x_mm"] for row, point in zip(rows, points)) for i in range(3)])
    y = _solve(matrix, [sum(row[i] * point["y_mm"] for row, point in zip(rows, points)) for i in range(3)])
    errors = [
        hypot(
            sum(x[i] * row[i] for i in range(3)) - point["x_mm"],
            sum(y[i] * row[i] for i in range(3)) - point["y_mm"],
        )
        for row, point in zip(rows, points)
    ]
    return {
        "report_version": "0.1.0",
        "profile_id": profile["profile_id"],
        "table_id": profile["table_id"],
        "source_kind": profile["source_kind"],
        "coordinate_units": "mm",
        "input_units": "pixels",
        "mapping_type": "2d_affine_preview",
        "orientation_status": "provisional",
        "matrix_x": [round(v, 12) for v in x],
        "matrix_y": [round(v, 12) for v in y],
        "landmark_count": len(rows),
        "rms_residual_mm": round(sqrt(sum(e * e for e in errors) / len(errors)), 9),
        "max_residual_mm": round(max(errors), 9),
        "ball_diameter_mm": profile["ball_diameter_mm"],
        "pocket_centers_provided": len(profile["pocket_centers_mm"]) == 6,
        "physical_calibration_verified": False,
        "limitations": [
            "Affine 2D mapping cannot correct perspective distortion or lens effects.",
            "In-sample residuals do not measure external calibration accuracy.",
            "No real-world coordinate directions, ball diameter or pocket geometry are verified.",
            "A supplied measurement or GLB mesh dimension is not independent physical verification.",
            "Preview parameters must not silently replace trajectory or model transforms.",
        ],
    }
