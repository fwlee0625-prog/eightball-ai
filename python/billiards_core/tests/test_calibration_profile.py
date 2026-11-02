import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from billiards_core.calibration_profile import fit_affine_preview

ROOT = Path(__file__).resolve().parents[3]


def profile():
    return json.loads((ROOT / "data/samples/calibration-preview-001.json").read_text(encoding="utf-8"))


def test_schema_and_exact_synthetic_affine_fit_are_readonly():
    v = profile()
    schema = json.loads((ROOT / "packages/contracts/schemas/calibration-preview.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(v)
    before = copy.deepcopy(v)
    r = fit_affine_preview(v)
    assert r["matrix_x"] == [2.0, 0.0, 0.0]
    assert r["matrix_y"] == [0.0, 3.0, 0.0]
    assert r["rms_residual_mm"] == 0
    assert r["physical_calibration_verified"] is False
    assert r["ball_diameter_mm"] is None
    assert r == fit_affine_preview(v)
    assert v == before
    assert json.dumps(r, allow_nan=False)


def test_noisy_extra_landmark_does_not_silently_claim_perfect_fit():
    v = profile()
    v["landmarks"][-1]["x_mm"] += 3
    r = fit_affine_preview(v)
    assert r["rms_residual_mm"] > 0
    assert r["physical_calibration_verified"] is False


@pytest.mark.parametrize("mutate", [
    lambda v: v.update(landmarks=v["landmarks"][:2]),
    lambda v: v["landmarks"][0].update(pixel_x=float("nan")),
    lambda v: v["landmarks"][0].update(x_mm=700),
    lambda v: v.update(ball_diameter_mm=True),
    lambda v: v.update(orientation_status="measured"),
    lambda v: v.update(pocket_centers_mm=[{"id": "a", "x_mm": 0, "y_mm": 0}]),
    lambda v: v["landmarks"][1].update(pixel_x=0, pixel_y=0),
])
def test_bad_calibration_profile_rejected(mutate):
    v = profile()
    mutate(v)
    with pytest.raises(ValueError):
        fit_affine_preview(v)


def test_collinear_pixel_landmarks_rejected():
    v = profile()
    for index, point in enumerate(v["landmarks"]):
        point["pixel_x"] = 10 * index
        point["pixel_y"] = 20 * index
    with pytest.raises(ValueError, match="degenerate or collinear"):
        fit_affine_preview(v)


def test_optional_declared_ball_size_is_never_verified():
    v = profile()
    v["ball_diameter_mm"] = 57.2
    r = fit_affine_preview(v)
    assert r["ball_diameter_mm"] == 57.2
    assert r["physical_calibration_verified"] is False
