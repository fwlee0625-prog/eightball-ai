# Web 前端

## 职责

Web 前端负责中式八球球局的可视化与用户交互。后续逐步承载手工摆球、球局导入、轨迹回放、下一杆推荐展示、清台规划动画和真实状态更新后的路线切换。

前端不负责赛事规则判定、台球物理计算、候选搜索或模型训练；这些能力应通过共享契约与后端模块交互。

## 当前状态

当前目录是 Vue 3 + TypeScript + Vite 初始化脚手架，不是已经完成的台球教练界面：

- src/App.vue 仍为 Vue 入门模板。
- src/router/index.ts 已初始化路由，但 routes 为空。
- src/stores/counter.ts 是 Pinia 示例 store，不是业务状态模型。
- src/__tests__/App.spec.ts 只验证模板文字。
- 尚无真实球桌组件、后端 API 适配层或规划动画。

## 技术栈

Vue 3、TypeScript、Vite、Pinia、Vue Router、Vitest、Vue Test Utils、Oxlint、ESLint 与 oxfmt。以本目录 package.json 和配置文件为实际依据。

当前 pnpm-workspace.yaml 配置了 Vue RC 版本覆盖，且仓库尚未提交 pnpm-lock.yaml；调整依赖前必须先确认实际解析版本和兼容性。

## 本地开发

在 apps/web 目录执行：

- pnpm install：安装依赖。
- pnpm dev：启动开发服务器。
- pnpm type-check：类型检查。
- pnpm build：类型检查并构建生产产物。
- pnpm exec vitest run：运行测试。
- pnpm exec oxlint .：只检查，不自动修复。
- pnpm exec eslint .：只检查，不自动修复。

注意：pnpm lint 当前调用带 --fix 的脚本，会修改文件；运行前确认工作区状态，避免覆盖未提交改动。

## 后续目录建议

业务增长后再按职责拆分 components、views、composables、services、types 和 stores。先保持小而清晰的结构，不要为了预想中的规模创建空的抽象层。

- components：可复用的球桌、球、袋口、轨迹和提示组件。
- views：页面级流程与布局。
- composables：可复用的交互状态和生命周期逻辑。
- services：HTTP / WebSocket 客户端和 API 适配。
- stores：跨页面共享的业务状态；局部 UI 状态留在组件内。
- types：前端展示层类型；跨模块契约以 packages/contracts 为准。

## UI 与状态约束

- Vue 组件优先使用 Composition API 和 script setup，并启用 TypeScript 类型。
- 不把大型算法或接口请求直接堆入 App.vue。
- 共享状态才进入 Pinia；组件局部状态不应无故全局化。
- 预测轨迹必须与真实观测区分展示，不能把模拟结果显示成实际击球结果。
- 每次球局更新都要校验 state_version；旧计划的消息和动画不得覆盖新状态。
- 必须覆盖加载、空数据、输入错误、接口失败、取消规划、断线重连等状态。
- 交互应支持键盘操作并提供清晰的错误信息。

## 测试要求

组件测试使用 Vitest 与 Vue Test Utils。新增功能至少覆盖正常显示、边界数据和错误状态；涉及规划流时覆盖乱序、重复事件、旧版本事件和取消事件。测试使用人工合成球局，不依赖外部真实数据。
