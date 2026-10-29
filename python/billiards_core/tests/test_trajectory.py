import copy
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from billiards_core.trajectory import TrajectoryValidationError, validate_trajectory_record


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_PATH = REPOSITORY_ROOT / "data" / "samples" / "trajectory-001.json"
SCHEMA_PATH = REPOSITORY_ROOT / "packages" / "contracts" / "schemas" / "trajectory.schema.json"


class TrajectoryRecordValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SAMPLE_PATH.open("r", encoding="utf-8") as sample_file:
            cls.sample = json.load(sample_file)
        with SCHEMA_PATH.open("r", encoding="utf-8") as schema_file:
            cls.schema = json.load(schema_file)

    def test_synthetic_sample_passes_json_schema_and_domain_validation(self):
        Draft202012Validator.check_schema(self.schema)
        Draft202012Validator(self.schema).validate(self.sample)
        validate_trajectory_record(self.sample)
        self.assertEqual(self.sample["timebase"]["nominal_fps"], 200)
        self.assertEqual(self.sample["frames"][3]["timestamp_ns"], 1_000_000_000)
        self.assertEqual(self.sample["frames"][3]["frame_index"], 200)

    def test_frame_index_gaps_are_allowed_but_timestamps_are_strictly_increasing(self):
        validate_trajectory_record(self.sample)
        broken = copy.deepcopy(self.sample)
        broken["frames"][3]["timestamp_ns"] = broken["frames"][2]["timestamp_ns"]
        with self.assertRaisesRegex(TrajectoryValidationError, "strictly increasing"):
            validate_trajectory_record(broken)

    def test_duplicate_detection_ids_are_rejected_per_frame(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"][0]["balls"][1]["id"] = broken["frames"][0]["balls"][0]["id"]
        with self.assertRaisesRegex(TrajectoryValidationError, "duplicate"):
            validate_trajectory_record(broken)

    def test_out_of_bounds_coordinates_are_rejected(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"][0]["balls"][0]["x_mm"] = 635.01
        with self.assertRaisesRegex(TrajectoryValidationError, "outside active table bounds"):
            validate_trajectory_record(broken)

    def test_boolean_is_not_accepted_as_a_frame_index(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"][0]["frame_index"] = True
        with self.assertRaisesRegex(TrajectoryValidationError, "integer"):
            validate_trajectory_record(broken)

    def test_unknown_fields_are_rejected(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"][0]["balls"][0]["ball_number"] = 8
        with self.assertRaisesRegex(TrajectoryValidationError, "unsupported fields"):
            validate_trajectory_record(broken)

    def test_nonfinite_coordinates_are_rejected(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"][0]["balls"][0]["x_mm"] = float("inf")
        with self.assertRaisesRegex(TrajectoryValidationError, "finite"):
            validate_trajectory_record(broken)

    def test_single_frame_is_rejected(self):
        broken = copy.deepcopy(self.sample)
        broken["frames"] = broken["frames"][:1]
        with self.assertRaisesRegex(TrajectoryValidationError, "between 2 and 10000"):
            validate_trajectory_record(broken)

    def test_validation_does_not_mutate_the_input(self):
        before = copy.deepcopy(self.sample)
        validate_trajectory_record(self.sample)
        self.assertEqual(self.sample, before)


if __name__ == "__main__":
    unittest.main()
