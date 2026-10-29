"""Tests for the read-only shot trajectory quality report."""

import copy
import json
import unittest
from pathlib import Path

from billiards_core.trajectory import TrajectoryValidationError
from billiards_core.trajectory_quality import analyze_trajectory_quality

ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "data" / "samples" / "trajectory-001.json"


class TrajectoryQualityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sample = json.loads(SAMPLE.read_text(encoding="utf-8"))

    def test_synthetic_sample_has_source_index_gaps_but_no_missing_detections(self):
        result = analyze_trajectory_quality(self.sample)
        self.assertEqual(result["frame_count"], 6)
        self.assertEqual(result["duration_ns"], 1_750_000_000)
        self.assertEqual(result["observed_detection_count"], 96)
        self.assertEqual(result["source_index_gap_intervals"], 5)
        self.assertEqual(result["unrecorded_source_indexes"], 345)
        self.assertEqual(result["missing_observation_count"], 0)
        self.assertEqual(result["nominal_timing_outlier_intervals"], 0)
        self.assertEqual(result["confidence_observation_count"], 0)
        self.assertEqual(result["overlap_check"], "skipped_no_diameter")
        self.assertIsNone(result["suspected_xy_overlap_count"])
        json.dumps(result)

    def test_absent_detection_and_low_confidence_are_separate(self):
        record = copy.deepcopy(self.sample)
        record["frames"][1]["balls"].pop()
        record["frames"][2]["balls"][0]["confidence"] = 0.2
        report = analyze_trajectory_quality(record)
        self.assertEqual(report["missing_observation_count"], 1)
        self.assertEqual(report["frames_with_missing_observations"], 1)
        self.assertEqual(report["confidence_observation_count"], 1)
        self.assertEqual(report["low_confidence_observation_count"], 1)

    def test_nominal_timing_heuristic_does_not_reject_valid_timestamps(self):
        record = copy.deepcopy(self.sample)
        record["frames"][1]["timestamp_ns"] = 400_000_000
        result = analyze_trajectory_quality(record)
        self.assertEqual(result["nominal_timing_outlier_intervals"], 2)

    def test_overlap_requires_explicit_diameter(self):
        record = copy.deepcopy(self.sample)
        first, second = record["frames"][0]["balls"][:2]
        second["x_mm"] = first["x_mm"]
        second["y_mm"] = first["y_mm"]
        self.assertIsNone(analyze_trajectory_quality(record)["suspected_xy_overlap_count"])
        result = analyze_trajectory_quality(record, ball_diameter_mm=57.15)
        self.assertGreaterEqual(result["suspected_xy_overlap_count"], 1)
        self.assertEqual(result["suspected_xy_overlap_examples"][0]["detection_ids"], [0, 1])

    def test_contiguous_two_frame_sample_has_no_warning_but_keeps_limitations(self):
        record = copy.deepcopy(self.sample)
        record["frames"] = record["frames"][:2]
        record["frames"][1]["frame_index"] = 1
        record["frames"][1]["timestamp_ns"] = 5_000_000
        report = analyze_trajectory_quality(record)
        self.assertEqual(report["warning_count"], 0)
        self.assertTrue(report["limitations"])

    def test_limitations_disclose_unmeasured_ball_radius_and_glb_scope(self):
        report = analyze_trajectory_quality(self.sample)
        limitations = " ".join(report["limitations"]).casefold()
        self.assertIn("ball radius/diameter has not been physically measured or calibrated", limitations)
        self.assertIn("ball_diameter_mm is caller-supplied", limitations)
        self.assertIn("a glb mesh dimension describes the model asset only", limitations)
        self.assertIn("not a verified physical ball size", limitations)

    def test_immutable_input_and_repeatable_report(self):
        record = copy.deepcopy(self.sample)
        original = copy.deepcopy(record)
        first = analyze_trajectory_quality(record)
        self.assertEqual(record, original)
        self.assertEqual(first, analyze_trajectory_quality(record))

    def test_invalid_record_is_rejected(self):
        record = copy.deepcopy(self.sample)
        record["frames"][0]["balls"][1]["id"] = record["frames"][0]["balls"][0]["id"]
        with self.assertRaisesRegex(TrajectoryValidationError, "duplicate"):
            analyze_trajectory_quality(record)

    def test_bad_thresholds_and_diameters_are_rejected(self):
        for option in (
            {"low_confidence_threshold": float("nan")},
            {"low_confidence_threshold": -0.1},
            {"nominal_timing_tolerance": 1.2},
            {"ball_diameter_mm": 0},
            {"ball_diameter_mm": False},
            {"ball_diameter_mm": float("inf")},
        ):
            with self.subTest(option=option):
                with self.assertRaises(ValueError):
                    analyze_trajectory_quality(self.sample, **option)


if __name__ == "__main__":
    unittest.main()
