import unittest

from billiards_core.pooltool_adapter import PooltoolAdapter
from billiards_core.simulator import (
    BallPose, ShotAction, SimulationInput, SimulationResult, TrajectoryFrame,
)


class FakeBridge:
    def run(self, balls, shot):
        self.balls = balls
        self.shot = shot
        original = tuple(BallPose(b.ball_id, b.x_m * 1000, b.y_m * 1000) for b in balls)
        return SimulationResult((TrajectoryFrame(0, original),), (), 0)


class PooltoolAdapterTests(unittest.TestCase):
    def setUp(self):
        self.request = SimulationInput(
            (BallPose(0, 125, -250), BallPose(3, 0, 0)),
            ShotAction(90, 1.5, 0.2, -0.3),
        )

    def test_converts_mm_to_m_and_delegates(self):
        bridge = FakeBridge()
        result = PooltoolAdapter(bridge).simulate(self.request)
        self.assertEqual((bridge.balls[0].x_m, bridge.balls[0].y_m), (0.125, -0.25))
        self.assertEqual(bridge.shot.speed_m_s, 1.5)
        self.assertEqual(result.frames[0].balls[0].ball_id, 0)

    def test_zero_coordinate_boundary(self):
        bridge = FakeBridge()
        request = SimulationInput((BallPose(0, 0, 0),), ShotAction(0, 1))
        PooltoolAdapter(bridge).simulate(request)
        self.assertEqual(bridge.balls[0].x_m, 0)

    def test_without_bridge_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, "not configured"):
            PooltoolAdapter().simulate(self.request)

    def test_rejects_bad_bridge_result(self):
        class BadBridge:
            def run(self, balls, shot):
                return None
        with self.assertRaises(TypeError):
            PooltoolAdapter(BadBridge()).simulate(self.request)

    def test_rejects_unknown_output_ball(self):
        class BadBridge:
            def run(self, balls, shot):
                return SimulationResult(
                    (TrajectoryFrame(0, (BallPose(0, 0, 0), BallPose(7, 0, 0))),),
                    (), 0,
                )
        with self.assertRaises(ValueError):
            PooltoolAdapter(BadBridge()).simulate(
                SimulationInput((BallPose(0, 0, 0),), ShotAction(0, 1))
            )


if __name__ == "__main__":
    unittest.main()
