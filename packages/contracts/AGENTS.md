# Shared Contracts 开发要求

本规则适用于 packages/contracts，并继承根目录 AGENTS.md。

## 唯一事实来源

- 跨模块传输的数据结构必须有明确的契约来源，避免前端、API 和 Python 各自复制并漂移。
- 在确定文件格式前，比较 JSON Schema、OpenAPI 和生成类型的维护成本；选定后记录决策，不同时维护多个未经同步的真相来源。
- docs/plan 中的示例是草案，不是自动生效的正式协议。

## 必须显式表达

- schema_version、单位、坐标系、坐标原点与轴方向。
- table_id、shot_id、state_version、ruleset_version、physics_version、model_version 和 plan_id 等适用的版本字段。
- 置信度、缺失值、未知规则状态、失败原因与数据来源。
- 流式事件的类型、sequence、幂等语义和取消 / 完成状态。

## 兼容性与验证

- 对新增字段定义必填 / 可选、默认值和空值语义。
- 破坏性修改需更新版本、迁移说明和所有相关消费者。
- 提供有效、边界、无效 JSON fixture，并测试 Schema 校验。
- 不在契约层实现业务计算，不把某一语言的内部类结构直接暴露为跨语言协议。
- 不在未核实中式八球赛事规则前将规则枚举写死为唯一合法版本。
