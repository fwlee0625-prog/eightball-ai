# API 与增量规划事件（设计草案，非已实现接口）

## HTTP
- `GET /health`：健康检查。
- `POST /api/v1/recommendations`：提交 `state_version + balls + ruleset + player_profile`，返回 `plan_id`、`recommended_shot`、`candidate_scores`、`confidence`、`runtime_ms`、`status`；错误时返回原因及降级建议。
- `POST /api/v1/plans`：创建清台规划任务，返回 plan_id；可以和下一杆推荐任务复用状态缓存。
- `POST /api/v1/plans/{plan_id}/cancel`：停止生成旧路线，后台即使无法立即取消也必须丢弃旧版本结果。

## WebSocket
`/ws/v1/plans/{plan_id}` 向前端发送计划片段，消息类型：
- `plan.started`；
- `shot.proposed`（包含 sequence、state_version、预计轨迹/白球停位/评分、是否最终确认）；
- `plan.progress`（已搜索节点、预计后续杆数可选）；
- `plan.completed`；
- `plan.failed` / `plan.cancelled`。

示例：
```json
{
 "type":"shot.proposed",
 "plan_id":"plan-123",
 "state_version":9,
 "sequence":2,
 "shot":{"aim_ball_id":3,"angle_rad":0.52,"cue_speed_mps":1.4,"cue_offset_x":0,"cue_offset_y":0.2},
 "predicted_cue_end_xy":[1.1,0.7],
 "prediction_only":true,
 "physics_version":"physics-001"
}
```

## 关键交互规则
每杆动画只消费同一 plan_id 中连续的 sequence；相同消息幂等去重。旧 state_version 所有待播动画丢弃。新真实状态优先于预测状态。网络断线先停止预测并请求新快照，不使用错乱轨迹。

## 延迟与异步边界
下一杆请求先做规则+快速候选，用少量精算在硬预算内返回；清台搜索在独立进程任务里继续，不阻塞主 HTTP 和 WebSocket 心跳。FastAPI 异步并不自动加速 CPU 密集仿真。WebSocket 只是传输，不代替计算任务队列。
