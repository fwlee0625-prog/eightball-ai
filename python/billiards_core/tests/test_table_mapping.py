import unittest

from billiards_core.state import TableGeometry
from billiards_core.table_mapping import TableMapping


class TableMappingTests(unittest.TestCase):
    def test_bounds_and_axis_directions(self):
        m = TableMapping()
        self.assertEqual(m.to_normalized(635, 1270), (1, 1))
        self.assertEqual(m.to_normalized(-635, -1270), (-1, -1))
        self.assertEqual(m.from_normalized(1, -1), (635, -1270))
        self.assertEqual(m.to_engine_metres(635, -1270), (0.635, -1.27))

    def test_pocket_clockwise_numbering(self):
        m = TableMapping()
        pockets = m.nominal_pocket_anchors()
        self.assertEqual([p.pocket_id for p in pockets], [1, 2, 3, 4, 5, 6])
        self.assertEqual([(p.x_mm, p.y_mm) for p in pockets],
                         [(-635, 1270), (635, 1270), (635, 0),
                          (635, -1270), (-635, -1270), (-635, 0)])
        self.assertTrue(all(not p.calibrated for p in pockets))

    def test_custom_geometry(self):
        m = TableMapping(TableGeometry(active_length_mm=2000, active_width_mm=1000))
        self.assertEqual(m.to_normalized(500, 1000), (1, 1))

    def test_centre_on_rectangle_edge(self):
        m = TableMapping()
        m.validate_ball_centre(635, 1270)
        with self.assertRaises(ValueError):
            m.validate_ball_centre(635.001, 0)

    def test_invalid_coordinates(self):
        m = TableMapping()
        for x, y in ((float("nan"), 0), (0, float("inf")), (True, 0), ("bad", 0)):
            with self.subTest(x=x, y=y):
                with self.assertRaises(ValueError):
                    m.to_normalized(x, y)


if __name__ == "__main__":
    unittest.main()
