# Billiards Core（台球领域核心）

## 当前状态

已实现第一步：视觉球坐标的基础校验和标准球局状态转换，以及对应的 Python 单元测试。赛事规则、几何碰撞、物理仿真、候选评分和规划算法仍未实现。

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
