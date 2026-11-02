# Shared Contracts（共享契约）

## 当前状态

已实现首版视觉球坐标 Schema 与标准球局状态 Schema（版本 0.1.0）。已补充M0健康响应契约及TypeScript校验器。球局业务API、击球动作、预测结果和WebSocket事件契约仍在规划中。

## 已实现文件

- schemas/health-response.schema.json：`GET /health` 的严格响应结构；API版本0.1.0。
- src/health.ts：前端健康响应类型与校验器，使用共享Schema常量；API测试同步验证生产者与Schema。
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


## 轨迹记录契约 v0.1.0

- `schemas/trajectory.schema.json` 是逐杆轨迹的正式 JSON Schema，当前前端和 Python 核心校验器共同消费。
- `frames[].timestamp_ns` 使用相对击球开始的纳秒值；首帧为 0，后续严格递增。实际时间戳是播放时间真相，`nominal_fps` 仅记录采集名义帧率，不用于推算缺失时间。
- `frame_index` 严格递增但允许跳号，以保留原始缺帧信息；单帧未检测到的 ID 不自动补齐或推断位置。
- 每帧的 `id` 仍是视觉追踪 ID，不是正式球号。坐标沿用标准状态的 mm / 台面中心原点 / 暂定方向，按活动矩形校验。
- `data/samples/trajectory-001.json` 是完全合成的 UI 样例，明确标记 `provenance.kind=synthetic`，不代表真实球局或物理仿真。
