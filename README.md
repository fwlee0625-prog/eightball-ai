# Eightball AI

中式八球 AI 决策与清台规划项目。目标是根据静止球局、球桌参数和赛事规则，生成可执行的下一杆建议，并逐步扩展到物理预测、多杆清台规划、轨迹回放和学习型策略。本项目提供决策辅助与预测，不控制真实球杆，也不保证模拟结果必然发生。

## 当前仓库状态

- 已实现首版：视觉坐标与标准球局 JSON Schema、Python 基础坐标校验 / 状态转换，以及固定样例。
- 已实现首版前端：使用 apps/web/public/model/billiards.glb 的三维球局工作台，可查看 16 个视觉检测目标、编辑本地坐标并恢复原始样例。
- 仍未实现：FastAPI 服务、完整赛事规则引擎、物理仿真、候选搜索与清台规划、机器学习训练、离线工具链和完整的跨模块测试体系。
- 前端坐标映射仍需标定：模型包围盒拟合、表面高度和坐标朝向尚未与真实活动台面校准。

研发规划中的目标、接口示例和模块设计不代表代码已经实现。规划中的里程碑只有在代码、测试和验收证据齐备后才能标记完成。

## 模块地图

| 路径 | 职责 | 当前状态 |
|---|---|---|
| apps/web | 球桌界面、状态输入、轨迹回放和规划结果展示 | 已实现首版三维球局工作台 |
| apps/api | FastAPI HTTP / WebSocket 服务入口 | 规划中 |
| packages/contracts | 前后端共享的数据契约、Schema 和 API 定义 | 已实现视觉输入与标准状态首版 Schema |
| python/billiards_core | 规则、几何、仿真适配、候选生成、评分与搜索 | 已实现基础坐标校验与状态转换；算法规划中 |
| python/billiards_ml | 数据集、模仿学习、强化学习和策略推理适配 | 规划中 |
| scripts | 数据转换、离线校准和评测命令 | 规划中 |
| tests | 跨模块单元、集成与固定球局回归测试 | 规划中；核心模块有局部单元测试 |
| data/samples | 样例输入与标准状态 | 已加入首份视觉坐标样例 |
| docs/plan | 研发规划、技术原理、阶段验收与参考资料 | 已存在 |

## 坐标输入与前端预览

- 原始视觉数据：data/samples/vision-balls-001.json
- 标准球局状态：data/samples/table-state-001.json
- JSON Schema：packages/contracts/schemas/
- 前端工作台说明：apps/web/README.md

活动台面暂按长度 2540 mm、宽度 1270 mm，台面中心为原点，X 沿宽度、Y 沿长度处理。正方向沿用视觉来源，尚待标定确认。模型比例、台呢实际矩形、表面高度和球体半径均为临时可视化假设，不可直接用于物理仿真。

## 本地运行

在 apps/web 目录执行：

    pnpm install
    pnpm dev

常用检查命令：

    pnpm type-check
    pnpm build
    pnpm exec vitest run
    pnpm exec oxlint .
    pnpm exec eslint .

当前仓库没有提交 pnpm-lock.yaml；依赖安装后应审查解析版本，并在建立可复现环境时提交锁文件。

## 核心校验测试

从仓库根目录执行：

    PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v

## 开发约定

- 先读根目录 AGENTS.md，再读目标模块内的 AGENTS.md 和 README.md。
- 以实际代码和测试为准；不把规划文档中的接口或功能当作已存在的实现。
- 坐标系、单位、规则版本、状态版本和物理参数必须显式定义，不得靠隐式约定互相猜测。
- 第三方库 API 以当前官方文档和已安装版本为准；先验证最小示例，不凭记忆猜接口。
- 未获准的数据不得提交；样例优先使用可复现的合成数据或明确提供给项目使用的数据。
- 不得仅凭仿真结果或训练集表现宣称达到职业水平。性能与策略结论必须附带可复现的评测方法和数据范围。
