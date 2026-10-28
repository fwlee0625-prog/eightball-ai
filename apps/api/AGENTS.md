# API 服务开发要求

本规则适用于 apps/api，并继承根目录 AGENTS.md。

## 职责边界

- 只实现 HTTP / WebSocket 入口、请求校验、任务编排、认证边界、错误映射和观测。
- 领域规则、几何、物理仿真、候选评分和搜索属于 python/billiards_core。
- 模型训练属于 python/billiards_ml；在线 API 只加载已发布模型或调用策略适配层。
- 请求与事件结构以 packages/contracts 的正式版本为准。

## 异步与计算

- 不在 ASGI 事件循环内执行长时间 CPU 密集型仿真或搜索。
- 对计算任务设置明确预算、取消语义、并发上限和超时降级。
- 不依赖单个进程的内存连接字典作为未来多进程部署的可靠任务系统。
- 后台任务失败、客户端断线或取消后，旧任务结果不得覆盖更新的 state_version。

## 事件一致性

- 每个规划任务有唯一 plan_id；每条逐杆事件包含 state_version 与单调 sequence。
- 对重复消息提供幂等处理策略；客户端或服务端都不得把旧状态的路线当作当前结果。
- 定义 plan.started、shot.proposed、plan.progress、plan.completed、plan.failed 和 plan.cancelled 等事件的正式 Schema 后再实现。

## 安全和测试

- 校验球桌范围、球坐标、球号、规则版本和输入大小。
- 不把内部堆栈、密钥或原始敏感数据返回给客户端。
- 使用 FastAPI 当前官方文档与锁定版本；先运行最小 HTTP 和 WebSocket 示例。
- 测试健康检查、非法输入、超时、取消、断连、重复与乱序事件。
- 未实现或未验证的路由不得出现在 README 中的“已支持接口”列表。
