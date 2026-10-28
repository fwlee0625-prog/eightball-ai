# Shared Contracts（共享契约）

## 状态

规划中。当前仓库尚无正式的共享 Schema / OpenAPI 文件。本目录将作为前端、API、核心算法和离线工具之间的数据契约来源。

## 职责

- 定义球桌、球、静止球局、击球动作、预测结果和规划任务的数据结构。
- 定义请求、响应、错误结构以及 WebSocket 事件。
- 记录 Schema 版本、单位、坐标系、规则版本和来源元数据。
- 为 TypeScript、Python 和测试提供可验证的契约。

## 计划中的核心概念

- TableState / BallState：球桌几何、球号、位置、置信度和规则状态。
- ShotAction / ShotPrediction：方向、速度、杆点、预测轨迹与白球停位。
- PlanEvent：plan_id、state_version、sequence、事件类型和结果版本。
- Provenance：数据来源、许可范围、采集设备和脱敏状态。

具体字段必须经过设计和测试后才能定稿；docs/plan 中的 JSON 仅为自定义草案，不应直接当作稳定协议。

## 契约演进

优先保持向后兼容的可选字段扩展。破坏性变更必须更新 Schema 版本或 API 版本，并同步修改生产者、消费者、样例和契约测试。
