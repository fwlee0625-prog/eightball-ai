import unittest

from billiards_core.simulator import (
    BallPose, ShotAction, SimulationEvent, SimulationInput,
    SimulationResult, TrajectoryFrame,
)


class SimulatorContractTests(unittest.TestCase):
    def test_valid_request_and_result(self):
        ball = BallPose(0, 0.0, 0.0)
        request = SimulationInput((ball,), ShotAction(90.0, 1.0))
        result = SimulationResult(
            (TrajectoryFrame(0.0, request.balls), TrajectoryFrame(0.1, request.balls)),
            (SimulationEvent(0.1, "stop", (0,)),), 0.5,
        )
        self.assertEqual(result.frames[0].balls[0].ball_id, 0)

    def test_tip_offset_boundary(self):
        self.assertEqual(ShotAction(0, 1, 1, 0).tip_offset_x, 1)

    def test_reject_missing_cue_ball(self):
        with self.assertRaises(ValueError):
            SimulationInput((BallPose(1, 0, 0),), ShotAction(0, 1))

    def test_reject_duplicate_ids(self):
        with self.assertRaises(ValueError):
            SimulationInput((BallPose(0, 0, 0), BallPose(0, 1, 1)), ShotAction(0, 1))

    def test_reject_invalid_tip_and_speed(self):
        for action in ((0, 0, 0, 0), (0, 1, 1, 1), (float("nan"), 1, 0, 0)):
            with self.subTest(action=action):
                with self.assertRaises(ValueError):
                    ShotAction(*action)

    def test_reject_out_of_order_frames(self):
        ball = BallPose(0, 0, 0)
        with self.assertRaises(ValueError):
            SimulationResult((TrajectoryFrame(0, (ball,)), TrajectoryFrame(0, (ball,))), (), 1)


if __name__ == "__main__":
    unittest.main()
