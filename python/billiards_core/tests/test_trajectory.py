import json
import unittest

from billiards_core.simulator import (
    BallPose, SimulationEvent, SimulationResult, TrajectoryFrame,
)
from billiards_core.trajectory import export_trajectory, sample_frame_at


class TrajectoryTests(unittest.TestCase):
    def setUp(self):
        self.result = SimulationResult(
            (
                TrajectoryFrame(0.0, (BallPose(3, 50, 0), BallPose(0, 0, 0))),
                TrajectoryFrame(0.2, (BallPose(0, 100, 0), BallPose(3, 50, 0))),
                TrajectoryFrame(0.4, (BallPose(3, 60, 0), BallPose(0, 120, 0))),
            ),
            (SimulationEvent(0.2, "ball_collision", (0, 3)),),
            1.25,
        )

    def test_json_export_and_sorted_ids(self):
        output = export_trajectory(self.result)
        self.assertEqual(output["duration_s"], 0.4)
        self.assertEqual(output["coordinate_frame"]["units"], "mm")
        self.assertEqual([b["id"] for b in output["frames"][0]["balls"]], [0, 3])
        self.assertEqual(output["events"][0]["ball_ids"], [0, 3])
        self.assertEqual(json.loads(json.dumps(output)), output)

    def test_sample_without_interpolation(self):
        self.assertEqual(sample_frame_at(self.result, 0.3)["time_s"], 0.2)
        self.assertEqual(sample_frame_at(self.result, 0.4)["time_s"], 0.4)
        self.assertEqual(sample_frame_at(self.result, 0)["time_s"], 0)

    def test_reject_time_outside_range(self):
        for t in (-0.1, 0.5, float("nan"), True):
            with self.subTest(t=t), self.assertRaises(ValueError):
                sample_frame_at(self.result, t)

    def test_reject_unknown_ball(self):
        invalid = SimulationResult(
            (TrajectoryFrame(0, (BallPose(0, 0, 0),)),
             TrajectoryFrame(1, (BallPose(0, 1, 1), BallPose(4, 0, 0)))),
            (), 0,
        )
        with self.assertRaisesRegex(ValueError, "unknown ball"):
            export_trajectory(invalid)

    def test_reject_reappearing_ball(self):
        invalid = SimulationResult(
            (TrajectoryFrame(0, (BallPose(0, 0, 0), BallPose(2, 1, 1))),
             TrajectoryFrame(1, (BallPose(0, 0, 0),)),
             TrajectoryFrame(2, (BallPose(0, 0, 0), BallPose(2, 1, 1)))),
            (), 0,
        )
        with self.assertRaisesRegex(ValueError, "reappeared"):
            export_trajectory(invalid)

    def test_reject_event_unknown_id(self):
        invalid = SimulationResult(
            (TrajectoryFrame(0, (BallPose(0, 0, 0),)),),
            (SimulationEvent(0, "stop", (9,)),), 0,
        )
        with self.assertRaisesRegex(ValueError, "event references"):
            export_trajectory(invalid)


if __name__ == "__main__":
    unittest.main()
