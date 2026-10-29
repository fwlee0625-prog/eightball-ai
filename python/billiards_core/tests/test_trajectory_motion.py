import copy
import json
from pathlib import Path

import pytest

from billiards_core.trajectory_motion import analyze_trajectory_motion


ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "data" / "samples" / "trajectory-001.json"


def fixture(steps=(0, 0, 0, 2, 4, 6, 6, 6, 6)):
    record = json.loads(SAMPLE.read_text(encoding="utf-8"))
    record["frames"] = []
    for index, x in enumerate(steps):
        record["frames"].append({
            "frame_index": index,
            "timestamp_ns": index * 5_000_000,
            "balls": [{"id": 4, "x_mm": float(x), "y_mm": 0.0}],
        })
    return record


def test_consecutive_motion_and_boundary_windows_are_candidates_not_hits():
    record = fixture()
    original = copy.deepcopy(record)
    report = analyze_trajectory_motion(record)
    assert report["stationary_interval_count"] == 4
    assert report["moving_interval_count"] == 4
    assert report["unknown_interval_count"] == 0
    assert [item["kind"] for item in report["boundary_candidates"]] == [
        "motion_start_candidate", "motion_stop_candidate",
    ]
    assert report["boundary_candidates"][0] == {
        "kind": "motion_start_candidate", "from_frame_index": 3,
        "to_frame_index": 4, "window_start_ns": 15_000_000,
        "window_end_ns": 20_000_000,
    }
    assert report == analyze_trajectory_motion(record)
    assert record == original
    assert json.dumps(report, allow_nan=False)


def test_source_gaps_never_claim_stationary_or_motion():
    record = json.loads(SAMPLE.read_text(encoding="utf-8"))
    report = analyze_trajectory_motion(record)
    assert report["unknown_interval_count"] == 5
    assert all(item["reason"] == "source_index_gap" for item in report["intervals"])
    assert report["boundary_candidates"] == []


def test_missing_id_and_low_confidence_are_unknown():
    record = fixture()
    record["frames"][4]["balls"] = [
        {"id": 4, "x_mm": 4.0, "y_mm": 0.0},
        {"id": 5, "x_mm": 12.0, "y_mm": 0.0},
    ]
    report = analyze_trajectory_motion(record)
    assert report["intervals"][2]["reason"] == "incomplete_observations"
    assert report["boundary_candidates"] == []

    record = fixture()
    record["frames"][4]["balls"][0]["confidence"] = 0.1
    report = analyze_trajectory_motion(record)
    assert report["intervals"][3]["reason"] == "low_confidence"
    assert report["intervals"][4]["reason"] == "low_confidence"
    assert report["boundary_candidates"] == []


def test_ambiguous_speed_is_not_forced_to_still_or_moving():
    record = fixture((0, 0.05))
    report = analyze_trajectory_motion(record)
    assert report["unknown_interval_count"] == 1
    assert report["intervals"][0]["reason"] == "threshold_ambiguity"


@pytest.mark.parametrize("kwargs", [
    {"stationary_speed_mm_s": 0},
    {"stationary_speed_mm_s": float("nan")},
    {"moving_speed_mm_s": 1},
    {"moving_speed_mm_s": True},
    {"min_run_intervals": 0},
    {"min_run_intervals": True},
    {"min_confidence": -0.1},
    {"min_confidence": float("inf")},
])
def test_invalid_thresholds_rejected(kwargs):
    with pytest.raises(ValueError):
        analyze_trajectory_motion(fixture(), **kwargs)


def test_invalid_trajectory_rejected():
    record = fixture()
    record["frames"][1]["timestamp_ns"] = 0
    with pytest.raises(ValueError, match="strictly increasing"):
        analyze_trajectory_motion(record)
