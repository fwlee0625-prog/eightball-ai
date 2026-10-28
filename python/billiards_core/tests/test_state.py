import copy
import json
import math
import unittest
from pathlib import Path

from billiards_core.state import (
    ObservationValidationError,
    TableGeometry,
    build_table_state,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_PATH = REPOSITORY_ROOT / "data" / "samples" / "vision-balls-001.json"


class BuildTableStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SAMPLE_PATH.open("r", encoding="utf-8") as sample_file:
            cls.sample_balls = json.load(sample_file)

    def test_project_sample_normalizes_all_sixteen_balls(self):
        state = build_table_state(
            self.sample_balls,
            table_id="vision-table-001",
            state_version=1,
            source="user-provided-vision-sample",
        )

        self.assertEqual(len(state["balls"]), 16)
        self.assertEqual([ball["id"] for ball in state["balls"]], list(range(16)))
        self.assertEqual(state["table_geometry"]["active_length_mm"], 2540.0)
        self.assertEqual(state["table_geometry"]["active_width_mm"], 1270.0)
        self.assertEqual(state["coordinate_frame"]["orientation_status"], "provisional")
        self.assertAlmostEqual(state["balls"][0]["x_mm"], -104.72715759277344)
        self.assertAlmostEqual(state["balls"][11]["y_mm"], -1243.425)
        self.assertNotIn("ball_radius_mm", state["table_geometry"])

    def test_duplicate_ids_are_rejected(self):
        with self.assertRaisesRegex(ObservationValidationError, "duplicate ball id"):
            build_table_state(
                [{"id": 1, "x": 0, "y": 0}, {"id": 1, "x": 10, "y": 10}],
                table_id="table",
                state_version=1,
            )

    def test_x_outside_active_surface_is_rejected(self):
        with self.assertRaisesRegex(ObservationValidationError, "outside active table bounds"):
            build_table_state(
                [{"id": 1, "x": 635.01, "y": 0}],
                table_id="table",
                state_version=1,
            )

    def test_y_outside_active_surface_is_rejected(self):
        with self.assertRaisesRegex(ObservationValidationError, "outside active table bounds"):
            build_table_state(
                [{"id": 1, "x": 0, "y": -1270.01}],
                table_id="table",
                state_version=1,
            )

    def test_non_finite_coordinates_are_rejected(self):
        with self.assertRaisesRegex(ObservationValidationError, "must be finite"):
            build_table_state(
                [{"id": 1, "x": math.nan, "y": 0}],
                table_id="table",
                state_version=1,
            )

    def test_boolean_is_not_accepted_as_an_id_or_coordinate(self):
        with self.assertRaisesRegex(ObservationValidationError, "must be an integer"):
            build_table_state(
                [{"id": True, "x": 0, "y": 0}],
                table_id="table",
                state_version=1,
            )
        with self.assertRaisesRegex(ObservationValidationError, "must be a number"):
            build_table_state(
                [{"id": 1, "x": False, "y": 0}],
                table_id="table",
                state_version=1,
            )

    def test_confidence_must_be_between_zero_and_one(self):
        with self.assertRaisesRegex(ObservationValidationError, "confidence"):
            build_table_state(
                [{"id": 1, "x": 0, "y": 0, "confidence": 1.1}],
                table_id="table",
                state_version=1,
            )

    def test_extra_fields_are_rejected(self):
        with self.assertRaisesRegex(ObservationValidationError, "unsupported fields"):
            build_table_state(
                [{"id": 1, "x": 0, "y": 0, "color": "unknown"}],
                table_id="table",
                state_version=1,
            )

    def test_table_geometry_must_be_positive(self):
        with self.assertRaises(ValueError):
            TableGeometry(active_length_mm=0, active_width_mm=1270)

    def test_normalized_state_is_deterministically_sorted(self):
        state = build_table_state(
            [{"id": 9, "x": 0, "y": 0}, {"id": 2, "x": 1, "y": 1}],
            table_id="table",
            state_version=1,
        )
        self.assertEqual([ball["id"] for ball in state["balls"]], [2, 9])

    def test_input_is_not_mutated(self):
        original = copy.deepcopy(self.sample_balls)
        build_table_state(original, table_id="table", state_version=1)
        self.assertEqual(original, self.sample_balls)


if __name__ == "__main__":
    unittest.main()
