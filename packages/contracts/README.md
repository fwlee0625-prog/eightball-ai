# Shared Contracts（共享契约）

## 当前状态

已实现首版视觉球坐标 Schema 与标准球局状态 Schema（版本 0.1.0）。完整的 API、击球动作、预测结果和 WebSocket 事件契约仍在规划中。

## 已实现文件

- schemas/vision-balls.schema.json：校验视觉提供方的原始数组结构，字段为 id、x、y，可选 confidence。
- schemas/table-state.schema.json：校验转换后的标准球局状态。
- ../../data/samples/vision-balls-001.json：本项目提供的第一份原始坐标样例。
- ../../data/samples/table-state-001.json：对应的标准球局状态样例。

JSON Schema 负责结构校验；球 ID 唯一性、坐标边界和有限数值由 python/billiards_core 中的核心校验器补充校验。

## 当前坐标约定

- 活动台面长度为 2540 mm，宽度为 1270 mm。
- 暂定原点为台面中心，X 轴沿宽度，Y 轴沿长度。
- X / Y 正方向暂时沿用视觉提供方的方向；在完成视觉标定前，标准状态会明确标记 orientation_status 为 provisional。
- 当前不推断球半径、袋口轮廓、白球身份、花色归属或规则状态。

## 契约演进

优先保持向后兼容的可选字段扩展。破坏性修改必须更新 Schema 版本或 API 版本，并同步修改生产者、消费者、样例和契约测试。docs/plan 中的历史 JSON 示例仍是设计草案，不自动成为正式契约。
