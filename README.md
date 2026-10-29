# Eightball AI

中式八球 AI 决策与清台规划项目。目标是根据静止球局、球桌参数和赛事规则，生成可执行的下一杆建议，并逐步扩展到物理预测、多杆清台规划、轨迹回放和学习型策略。本项目提供决策辅助与预测，不控制真实球杆，也不保证模拟结果必然发生。

## 使用平台

本平台仅面向 **PC 桌面浏览器**，使用鼠标和键盘操作。不要求手机或平板适配，移动端布局和触控交互不属于当前开发与验收范围。

## 当前仓库状态

- 已实现首版：视觉坐标与标准球局 JSON Schema、Python 基础坐标校验 / 状态转换，以及固定样例。
- 已实现首版前端：使用 apps/web/public/model/billiards.glb 的三维球局工作台，可查看 16 个视觉检测目标、编辑本地坐标并恢复原始样例。
- 已实现 M0 服务基础：FastAPI `/health`、显式 CORS 配置、前端真实健康状态与失败重试、pytest / Ruff 和 GitHub Actions 检查工作流。本地联通及远程 CI 已通过 M0 验收，证据见 R-010（GitHub Actions run40703817062）。
- 仍未实现：球局业务 API、完整赛事规则引擎、物理仿真、候选搜索与清台规划、机器学习训练、离线工具链和完整的跨模块测试体系。
- 前端坐标映射仍需标定：模型尺寸沿用 GLB（仅米转毫米），表面高度和坐标朝向尚未与真实活动台面校准。

研发规划中的目标、接口示例和模块设计不代表代码已经实现。规划中的里程碑只有在代码、测试和验收证据齐备后才能标记完成。

## 模块地图

| 路径 | 职责 | 当前状态 |
|---|---|---|
| apps/web | 球桌界面、状态输入、轨迹回放和规划结果展示 | 已实现首版三维球局工作台 |
| apps/api | FastAPI HTTP / WebSocket 服务入口 | 已实现 /health；业务路由和 WebSocket 规划中 |
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

活动台面暂按长度 2540 mm、宽度 1270 mm，台面中心为原点，X 沿宽度、Y 沿长度处理。正方向沿用视觉来源，尚待标定确认。模型尺寸由资产控制；台呢实际矩形、表面高度和球体半径仍待标定，不可直接用于物理仿真。

## 本地运行

要求：Node `^22.18.0 || >=24.12.0`、pnpm 11.25.0、Python 3.12/3.13、uv 0.11.3。
前端保留既有Vue RC覆盖配置，本轮未升级或重新解析前端依赖；使用已提交锁文件。

```bash
# 仓库根目录：安装锁定的后端/检查工具依赖
uv sync --locked
# apps/web 目录：安装锁定的前端依赖
pnpm install --frozen-lockfile
```

本地服务统一通过 Spark 项目管理平台管理：

| 项目 | 工作目录 | 启动命令 | 地址 |
|---|---|---|---|
| eightball-ai / web | apps/web | `pnpm dev --host localhost --port 5173` | http://localhost:5173 |
| eightball-ai-api / api | 仓库根目录 | `.venv/bin/python -m uvicorn billiards_api.main:create_app --factory --app-dir apps/api --host localhost --port 8000` | http://localhost:8000/health |

前端默认连接 `http://localhost:8000`。需要覆盖时将 `apps/web/.env.example` 复制为
`apps/web/.env.local` 并修改公开配置 `VITE_API_BASE_URL`，然后通过Spark重启web。
API CORS配置见 [apps/api/README.md](apps/api/README.md) 和根目录 `.env.example`。
`.env`/`.env.local`均被忽略；不要将密钥放进 `VITE_*`。

前端健康状态包含连接中、已连接、未连接与重试；3秒超时。API离线不妨碍本地球局编辑。
API健康仅表示服务存活，不表示物理或规划功能已实现。

## 检查与 CI

apps/web目录：

```bash
pnpm type-check
pnpm exec vitest run
pnpm exec oxlint .
pnpm exec eslint .
pnpm build
```

仓库根目录：

```bash
uv run --locked pytest -q
uv run --locked ruff check .
```

`.github/workflows/ci.yml` 在push、pull_request及手动触发时执行以上检查。
CI使用 `uv.lock` 和 `apps/web/pnpm-lock.yaml`，不进行隐式依赖升级。
初始Ruff基线为E4/E7/E9/F，覆盖API与Python模块；不继承个人全局规则，也不自动修复。
构建体积及测试依赖弃用警告仍保留。M0的最终验收需本地前后端联通且远程CI实际绿灯，
仅存在工作流文件不能算CI已通过。

## 核心校验测试

从仓库根目录执行：

    PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v

## 开发约定

- 先读根目录 AGENTS.md，再读目标模块内的 AGENTS.md 和 README.md。
- 每次 Git commit 使用“英文类型前缀 + 中文改动摘要”，例如 `feat: 实现球桌模型几何标定`；详见根目录 AGENTS.md 的“Git 提交规范”。
- 本地验证统一记录在 docs/verification/LOCAL_VALIDATION_LOG.md；未在真实环境执行的检查不得声称通过。
- 以实际代码和测试为准；不把规划文档中的接口或功能当作已存在的实现。
- 坐标系、单位、规则版本、状态版本和物理参数必须显式定义，不得靠隐式约定互相猜测。
- 第三方库 API 以当前官方文档和已安装版本为准；先验证最小示例，不凭记忆猜接口。
- 未获准的数据不得提交；样例优先使用可复现的合成数据或明确提供给项目使用的数据。
- 不得仅凭仿真结果或训练集表现宣称达到职业水平。性能与策略结论必须附带可复现的评测方法和数据范围。
