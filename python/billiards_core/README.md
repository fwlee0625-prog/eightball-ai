# Billiards Core（台球领域核心）

## 当前状态

已实现第一步：视觉球坐标的基础校验、标准球局状态转换，以及逐杆轨迹记录 v0.1.0 的结构与领域约束校验。赛事规则、几何碰撞、物理仿真、候选评分和规划算法仍未实现。

## 已实现内容

- 默认台面参数：活动长度 2540 mm、活动宽度 1270 mm，可通过 TableGeometry 显式覆盖。
- 校验球 ID 类型与范围、同一状态内 ID 唯一性、有限坐标值、台面矩形边界和可选置信度。
- 将原始 x / y 映射为标准状态的 x_mm / y_mm，并按 ID 排序，保证输出稳定。
- 输出 schema_version、table_id、state_version、source、coordinate_frame、table_geometry 和 balls。
- 不会推断 ID 对应白球、花色或实际球号；不会推断球半径、袋口或规则状态。

## 坐标假设与限制

当前首版按毫米、台面中心为原点、X 沿宽度、Y 沿长度处理。正方向沿用视觉来源，尚未通过标定确认，因此输出将坐标方向标记为 provisional。校验只检查点是否落在活动台面矩形内，不应用球半径边距，也不检查球体重叠。

## 测试

从仓库根目录执行：

    PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v

测试使用 data/samples/vision-balls-001.json 中的固定输入，并覆盖有效输入、重复 ID、越界、非有限值、布尔类型误传、置信度和输入不被修改等情况。

## 后续开发

1. 与视觉提供方确认单位、原点、正方向和帧时间信息。
2. 确认球半径与袋口几何，再实现球体碰撞和可达区域检查。
3. 明确 id 是追踪 ID 还是球的真实编号，并建立 cue-ball / group 等独立语义字段。
4. 在契约稳定后接入 API 和前端球桌可视化。

## 逐杆轨迹校验

- `billiards_core.trajectory.validate_trajectory_record` 校验轨迹元数据、相对击球时间戳、原始帧索引、逐帧检测 ID、坐标边界与来源标记。
- JSON Schema 由 `packages/contracts/schemas/trajectory.schema.json` 提供；测试同时检查 Schema 自身和领域规则。
- 从仓库根目录执行 `uv run --locked pytest -q` 或项目原有 unittest 命令运行测试。


## M1.4：轨迹数据质量报告（Python 内部 API）

新增 billiards_core.trajectory_quality.analyze_trajectory_quality(record, low_confidence_threshold=0.5, nominal_timing_tolerance=0.25, ball_diameter_mm=None)。它先复用正式 v0.1.0 轨迹校验器，然后只读统计记录帧数量、源索引缺口、同杆检测 ID 缺失、置信度低值和时间戳相对名义 FPS 的偏差。报告 JSON 可序列化、同输入结果稳定；每类仅显示最多 20 条示例，统计计数保留完整。

未提供球直径时跳过重叠诊断，输出 null 而非 0。只有调用者提供经过测量的球直径，才计算二维球心间距疑似重叠；不能直接推断真实碰撞、入袋或掉帧。来源 ID 不是正式球号，坐标原点和方向仍待标定，名义 FPS 不是实测采集性能。真实球半径/直径尚未经过实测标定；`ball_diameter_mm` 是调用方提供的诊断参数，传入参数本身不证明已标定。GLB 网格尺寸只描述模型资产，不能证明现实球的实际尺寸。当前没有前端质量卡或服务 API；本轮只覆盖 Python 核心。执行 uv run --locked pytest -q python/billiards_core/tests/test_trajectory_quality.py 和 uv run --locked ruff check .；自动化与本地状态按 M1.4 验证日志为准。

## M1.6：XY 运动与击球边界候选

调用 `billiards_core.trajectory_motion.analyze_trajectory_motion(record, stationary_speed_mm_s=2, moving_speed_mm_s=20, min_run_intervals=2, min_confidence=0.5)`。只比较原始相邻索引的检测：有索引缺口、观测 ID 不完整、显式低置信度或速度处于阈值灰区时记 unknown；仅在连续区间至少 2 段静止转 2 段运动（反之亦然）时输出候选时间窗。所有速度采用原始时间戳，单位 mm/s。不能据此确证真实击球、旋转、碰撞、进袋或物理参数；默认阈值仅用于合成诊断，真实测量后需独立校验。
