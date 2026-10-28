# Eightball AI

中式八球 AI 决策与清台规划项目。目标是根据静止球局、球桌参数和赛事规则，生成可执行的下一杆建议，并逐步扩展到物理预测、多杆清台规划、轨迹回放和学习型策略。本项目提供决策辅助与预测，不控制真实球杆，也不保证模拟结果必然发生。

## 当前仓库状态

- 已存在：apps/web 下的 Vue 3、TypeScript、Vite 前端脚手架。
- 已实现首版：packages/contracts 的视觉坐标与标准球局 JSON Schema；python/billiards_core 的基础坐标校验和状态转换；data/samples 的原始输入与转换结果样例。
- 仍未实现：FastAPI 服务、完整赛事规则引擎、物理仿真、候选搜索与清台规划、机器学习训练、离线工具链和完整的跨模块测试体系。
- 当前前端仍是脚手架：App.vue 仍显示 Vue 模板内容，路由尚无业务页面，counter store 是初始化示例。

研发规划中的目标、接口示例和模块设计不代表代码已经实现。规划中的里程碑只有在代码、测试和验收证据齐备后才能标记完成。现有 M0 计划包含 API 健康检查和 CI，但当前仓库尚未看到对应实现，因此不能仅凭前端初始化认定 M0 的全部验收项已通过。

## 模块地图

| 路径 | 职责 | 当前状态 |
|---|---|---|
| apps/web | 球桌界面、状态输入、轨迹回放和规划结果展示 | 已初始化脚手架 |
| apps/api | FastAPI HTTP / WebSocket 服务入口 | 规划中 |
| packages/contracts | 前后端共享的数据契约、Schema 和 API 定义 | 已实现视觉输入与标准状态首版 Schema |
| python/billiards_core | 规则、几何、仿真适配、候选生成、评分与搜索 | 已实现基础坐标校验与状态转换；算法规划中 |
| python/billiards_ml | 数据集、模仿学习、强化学习和策略推理适配 | 规划中 |
| scripts | 数据转换、离线校准和评测命令 | 规划中 |
| tests | 跨模块单元、集成与固定球局回归测试 | 规划中；核心模块有局部单元测试 |
| data/samples | 样例输入与标准状态 | 已加入首份视觉坐标样例 |
| docs/plan | 研发规划、技术原理、阶段验收与参考资料 | 已存在 |

各模块的边界和开发要求见对应目录的 README.md 与 AGENTS.md。

## 坐标输入第一步

- 原始视觉数据：data/samples/vision-balls-001.json
- 转换后的标准状态：data/samples/table-state-001.json
- 输入 Schema：packages/contracts/schemas/vision-balls.schema.json
- 标准状态 Schema：packages/contracts/schemas/table-state.schema.json
- 视觉输入与状态契约说明：docs/plan/04_数据与接口/视觉输入与标准状态契约.md

当前暂按活动台面长度 2540 mm、宽度 1270 mm，台面中心为原点，X 沿宽度、Y 沿长度处理。正方向仍继承视觉来源，尚待标定确认。球半径、袋口几何和球 ID 语义没有被假定。

## 运行核心校验测试

从仓库根目录运行：

    PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v

## 本地运行前端

当前仓库没有根目录 package.json；请在 apps/web 目录执行：

1. 确认 Node.js 满足 apps/web/package.json 声明的版本范围：^22.18.0 或 >=24.12.0。
2. 执行 pnpm install 安装依赖。
3. 执行 pnpm dev 启动开发服务器。

常用验证命令：

- pnpm type-check：运行 Vue / TypeScript 类型检查。
- pnpm build：运行类型检查和生产构建。
- pnpm exec vitest run：执行前端单元测试。
- pnpm exec oxlint .：运行 Oxlint 检查，不自动修复。
- pnpm exec eslint .：运行 ESLint 检查，不自动修复。

注意：当前 package.json 中的 pnpm lint 会通过带有 --fix 的脚本自动修改文件；审查时如只想检查、不想修改，请使用上面的只读检查命令。apps/web/pnpm-workspace.yaml 还配置了 Vue RC 版本覆盖；仓库当前未提交 pnpm-lock.yaml。变更依赖或排查环境差异前，应先核实实际解析到的版本，并在建立可复现构建时提交锁文件。

## 研发文档

- [研发规划总览](docs/plan/README.md)
- [路线总图](docs/plan/00_总览/路线总图.md)
- [产品目标和边界](docs/plan/01_需求与架构/产品目标和边界.md)
- [系统架构与启动](docs/plan/01_需求与架构/系统架构与启动.md)
- [数据字典和 JSON 示例](docs/plan/04_数据与接口/数据字典和JSON示例.md)
- [视觉输入与标准状态契约](docs/plan/04_数据与接口/视觉输入与标准状态契约.md)
- [API 与流式消息草案](docs/plan/04_数据与接口/API与流式消息.md)
- [测试基准与验收清单](docs/plan/05_测试与交付/测试基准与验收清单.md)
- [Codex 任务拆解](docs/plan/05_测试与交付/Codex任务拆解.md)

## 全局约定

- 先读根目录 AGENTS.md，再读目标模块内的 AGENTS.md 和 README.md。
- 以实际代码和测试为准；不把规划文档中的接口或功能当作已存在的实现。
- 坐标系、单位、规则版本、状态版本和物理参数必须显式定义，不得靠隐式约定互相猜测。
- 第三方库 API 以当前官方文档和锁定版本为准；先验证最小示例，不凭记忆猜接口。
- 未获准的数据不得提交；样例优先使用可复现的合成数据或明确提供给项目使用的数据。
- 不得仅凭仿真结果或训练集表现宣称达到职业水平。性能与策略结论必须附带可复现的评测方法和数据范围。
