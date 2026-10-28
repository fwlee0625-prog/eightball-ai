# 本地验证清单与结果记录（Codex）

> **用途：** 记录需要在开发者本地执行的检查，以及每次检查的真实结果。ChatGPT 网页端不能直接访问开发者机器上的文件、终端和浏览器，因此本文档是 ChatGPT 与本地 Codex 之间的验证交接入口。
>
> **原则：** 写了代码 ≠ 验证通过；页面能打开 ≠ 模型标定正确；静态检查通过 ≠ 物理参数可信。未执行的检查必须保持“未运行”，不得根据推测填成通过。

## 1. 协作规则

1. 每轮开始时，Codex 先读取根目录 `AGENTS.md`、`README.md`、`apps/web/AGENTS.md`、`apps/web/README.md` 和本文档。
2. 每次创建 Git commit 前，必须遵守根目录 `AGENTS.md` 的“Git 提交规范（强制）”：使用英文类型前缀和中文改动摘要，例如 `feat: 实现球桌模型几何标定`；完成后检查实际提交说明。
3. 先检查 `git status --short`、当前分支和 HEAD。若工作区已有用户改动，必须保留，不得重置、覆盖、清理或自动暂存这些改动。
4. 先执行只读检查。除非用户另行授权，不要为了“让测试通过”而自动修改业务代码、升级依赖、替换/压缩 GLB 模型或改变坐标假设。
5. 每项结果都记录：日期、环境、命令或操作、退出码/实际结果、证据路径、失败信息和后续动作。不要只写“正常”“看起来没问题”。
6. 检查失败时，先保留原始错误并说明最小复现步骤。不要隐藏失败、跳过测试或把警告改写为通过。
7. 只有在实际运行且达到该项验收标准后才能标记“通过”。需要人工确认的几何语义应标为“待人工确认”，不能由程序输出自动推断。
8. 如需临时脚本解析 GLB，优先放到系统临时目录；不要为了单次检查把临时脚本混入产品代码。若认为该脚本值得长期保留，先报告建议和用途。
9. 运行 `pnpm install` 若新生成 `pnpm-lock.yaml`，记录该文件和依赖解析情况；不要未经审查就删除锁文件、升级版本或提交与本轮无关的依赖变化。
10. 每次验证追加一条“运行记录”，保留历史结果；新一轮结果不能覆盖旧记录。代码发生变化后，旧的通过结果不自动代表新代码仍然通过。

## 2. 给 Codex 的首轮任务指令

可以把下面这段直接交给本地 Codex：

```text
请先读取根目录 AGENTS.md、README.md、apps/web/AGENTS.md、apps/web/README.md 和 docs/verification/LOCAL_VALIDATION_LOG.md。

本轮先做验证，不要擅自修改业务代码。先报告 git branch、HEAD、git status 和本地环境版本；保留工作区已有改动。按本文档 A 阶段运行前端静态检查、单元测试和构建；然后按 B 阶段只读检查 apps/web/public/model/billiards.glb 的文件完整性、GLB 结构、场景节点、网格、材质、变换、世界坐标包围盒和可辨识的台面/袋口几何；最后按 C 阶段启动页面，检查模型是否真实加载而非 fallback，并验证交互。

不要仅凭包围盒断言台呢区域、袋口中心、物理尺寸或台面高度。不要修改或重新导出 GLB。无法确定的项目请标记为 NEEDS REVIEW，并说明需要什么人工证据。请把实际命令、退出码、关键输出、截图/日志路径、失败原因和未决问题追加到本文档的“运行记录”，同时在最终回复中给出摘要。若检查失败，先报告，不要自动修复，等待后续指示。
```

## 3. 状态定义

| 状态 | 含义 |
|---|---|
| `NOT RUN` / 未运行 | 尚未在本地实际执行 |
| `PASS` / 通过 | 已执行且满足该项明确的验收标准，并留下证据 |
| `FAIL` / 失败 | 已执行但未满足标准，或发现错误 |
| `BLOCKED` / 阻塞 | 因缺少工具、依赖、资产或权限而无法执行 |
| `NEEDS REVIEW` / 待人工确认 | 工具已输出信息，但几何含义、真实尺寸或业务假设还需要人确认 |

## 4. 已知基线（不是验证结论）

- 文档创建时 GitHub `main` 的基线提交：`6742e16c5a25fe090496882d03da664f8a832a1a`。
- 预期模型路径：`apps/web/public/model/billiards.glb`。仓库中存在该路径不代表本地工作副本已同步，也不代表模型内容有效。
- 当前前端使用 Three.js `GLTFLoader` 加载模型；若加载失败会显示简化球台。**必须区分真实 GLB 和 fallback 球台**。
- 当前实现暂按活动台面长 2540 mm、宽 1270 mm；模型按包围盒拟合，表面高度使用临时估计，球半径暂用 28.575 mm。它们都是待验证假设，不是已标定参数。
- 仓库当前没有提交 `pnpm-lock.yaml`；安装时如产生该文件，应记录并审查，不要把依赖可安装误认为依赖版本已经可复现。
- ChatGPT 网页端尚未在用户本地运行下列命令。因此，下表初始状态全部为“未运行”。

## 5. A 阶段：本地环境与前端工程检查

先在仓库根目录运行：

```bash
git status --short
git rev-parse --show-toplevel
git branch --show-current
git rev-parse HEAD
node --version
pnpm --version
```

确认 Node.js 满足 `apps/web/package.json` 中声明的版本范围。随后进入 `apps/web`。若依赖尚未安装，再执行 `pnpm install` 并记录结果。

| ID | 检查项 | 命令/操作 | 通过标准 | 初始状态 |
|---|---|---|---|---|
| A-01 | 工作区与版本基线 | 上述 Git 命令 | 记录分支、HEAD、已有改动；没有覆盖用户文件 | 未运行 |
| A-02 | Node / pnpm 版本 | 上述版本命令 | Node 满足 package.json 的 engines；pnpm 可正常运行 | 未运行 |
| A-03 | 依赖安装 | `cd apps/web && pnpm install`（仅在需要时） | 安装成功；记录警告、依赖解析和是否产生锁文件 | 未运行 |
| A-04 | TypeScript / Vue 类型检查 | `cd apps/web && pnpm type-check` | 退出码为 0；无类型错误 | 未运行 |
| A-05 | 前端单元测试 | `cd apps/web && pnpm exec vitest run` | 所有测试通过；记录实际通过/失败数量 | 未运行 |
| A-06 | 生产构建 | `cd apps/web && pnpm build` | 退出码为 0；没有未解释的构建错误 | 未运行 |
| A-07 | Oxlint（只检查） | `cd apps/web && pnpm exec oxlint .` | 退出码为 0，或逐项记录已有问题 | 未运行 |
| A-08 | ESLint（只检查） | `cd apps/web && pnpm exec eslint .` | 退出码为 0，或逐项记录已有问题 | 未运行 |
| A-09 | Python 核心回归 | 仓库根目录执行下方命令 | 测试退出码为 0；若 Python 环境不齐则记录阻塞原因 | 未运行 |

Python 核心回归命令（在仓库根目录执行）：

```bash
PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v
```

> Windows PowerShell 若不接受 `PYTHONPATH=...` 这种环境变量写法，请使用 PowerShell 等效写法设置 `$env:PYTHONPATH = "python/billiards_core"` 后再运行测试，并记录实际命令。

## 6. B 阶段：GLB 文件与真实几何检查

### B-01 文件存在和完整性

- 确认 `apps/web/public/model/billiards.glb` 在本地存在，且 Git 跟踪状态符合预期。
- 记录文件字节数、SHA-256、最后修改状态；检查是否为意外的空文件或被本地改动替换。
- 读取 GLB 头部：magic 应为 `glTF`，版本应为 2，声明长度应与实际文件长度一致；确认 JSON 与 BIN chunk 的边界合法。
- 不要把模型上传到第三方网站；本轮优先在本机离线解析。

**验收：** 文件可读、GLB 容器结构完整，证据包含文件大小、SHA-256 和解析结果。若失败，停止几何标定，不要改动原模型。

### B-02 场景图与网格结构

用本地可用工具（优先现有依赖；如有 Blender 可用其后台模式；否则用临时解析脚本）检查并记录：

- scene、node、mesh、primitive、material 的名称与数量；
- 节点层级及每个节点的 translation / rotation / scale / matrix；
- POSITION accessor 的数量、类型、min/max；必要时解码顶点；
- 合并所有节点变换后的**世界坐标包围盒**，不要只看单个 accessor 的局部 min/max；
- 是否存在外部依赖文件；GLB 主要资源是否确实内嵌；
- 模型是否存在异常缩放、零尺寸网格、非有限坐标或缺失材质。

**验收：** 输出可复查的结构摘要，并区分“模型原始坐标范围”和“应用变换后的世界坐标范围”。单凭总体包围盒不能确认台呢的真实边界。

### B-03 台面、库边和袋口辨识

结合网格/材质名称、局部几何和实际渲染，逐项记录：

- 台呢（可击球表面）是否为独立网格/材质，能否明确辨认四条边；
- 库边、框架、腿部是否与台呢网格分离；
- 六个袋口是否能从几何中明确识别，袋口开口边缘是否有可测量的顶点/轮廓；
- 模型是否包含装饰、阴影面、隐藏网格或碰撞代理，这些是否干扰包围盒；
- 哪些几何可以程序自动提取，哪些必须在 Blender 或其他 3D 查看器中人工确认。

**验收：** 为台呢四边和六个袋口提供可追溯的网格/节点名称、坐标或截图。若袋口只是贴图/视觉凹陷，不能伪造其精确几何中心或有效开口尺寸，应标记 NEEDS REVIEW。

### B-04 轴向与尺寸假设

- 记录 GLB 原生坐标轴方向、应用中的旋转/缩放和最终世界轴向。
- 记录模型原始包围盒的三轴尺寸与比例；检查当前代码是否通过旋转或非均匀缩放改变了模型比例。
- 不要仅因模型最长轴就断定它是球桌长度轴；必须结合台呢矩形、袋口位置和视图证据。
- 不要直接把模型原生数值当作毫米。报告中明确写出原生单位假设、转换比例和证据来源。
- 将“模型外框尺寸”和“活动台呢尺寸”分别记录，不得混用。

**验收：** 输出明确的轴向映射（模型轴 → 场景轴 → 物理 X/Y）、实际应用变换，以及活动台面尺寸的测量方法。未有可靠依据时状态为 NEEDS REVIEW。

## 7. C 阶段：浏览器场景与坐标映射检查

启动开发服务器：

```bash
cd apps/web
pnpm dev
```

在本地浏览器打开 Vite 输出的地址，按以下清单验证。若 Codex 环境无法访问浏览器，则记录 BLOCKED，并请用户手动完成对应项、提供截图/录屏和浏览器控制台信息。

| ID | 检查项 | 操作 | 通过标准 | 初始状态 |
|---|---|---|---|---|
| C-01 | 确认真模型加载 | 查看页面状态提示、网络请求和控制台 | 显示模型已载入；请求的 GLB 成功；没有落入简化球台 fallback | 未运行 |
| C-02 | 模型完整性 | 旋转观察台面、库边、袋口和支架 | 模型可见部分与 GLB 几何一致，无明显缺失、镜像或离屏问题 | 未运行 |
| C-03 | 视角交互 | 拖拽、滚轮缩放、俯视、重置 | 各操作正常；俯视方向清楚，重置可恢复预期视角 | 未运行 |
| C-04 | 球体叠加 | 对照样例坐标观察球体 | 球体位于可击球表面附近，不悬空、不埋入台呢或落在库边；不满足时记录误差而非主观判通过 | 未运行 |
| C-05 | 选择和 ID | 点击球体、点击空白区域、切换 ID 标签 | 选择目标正确，空白区域可取消选择，标签开关生效 | 未运行 |
| C-06 | 坐标编辑 | 选择球体，输入有效坐标、越界坐标和非数字/空值 | 合法值生效；非法值有明确提示且不污染状态 | 未运行 |
| C-07 | 重置状态 | 修改坐标后恢复原始样例 | 球局恢复到 fixture 原值，版本号与选择状态按设计复位 | 未运行 |
| C-08 | 浏览器控制台 | 查看 Console 与 Network | 没有未解释的异常；记录 WebGL、资源加载、纹理和 shader 错误 | 未运行 |

## 8. D 阶段：几何标定的放行门槛

以下参数在获得本地检查证据前均不能视为已标定：

| ID | 参数/假设 | 当前状态 | 需要的证据 | 初始状态 |
|---|---|---|---|---|
| D-01 | 活动台面长、宽 | 暂定 2540 × 1270 mm | 真实球桌规格或可靠测量；与 GLB 活动台呢边界对应 | 未运行 |
| D-02 | 台面中心原点 | 暂按中心 | 四边界坐标及变换计算 | 未运行 |
| D-03 | X/Y 正方向 | 暂定 X 沿宽度、Y 沿长度 | 顶视图、袋口/边界坐标和已知点对应关系 | 未运行 |
| D-04 | 模型到物理坐标变换 | 现有自动拟合仅为临时方案 | 明确的平移、旋转、缩放矩阵；已知点映射测试 | 未运行 |
| D-05 | 台呢表面高度 | 当前为包围盒顶部减 36 mm 的估计 | 台呢真实网格表面高度；不得用外框顶面替代 | 未运行 |
| D-06 | 球半径 | 暂定 28.575 mm | 对项目实际使用球测量直径，或明确的球规格依据 | 未运行 |
| D-07 | 六个袋口 | 中心/有效开口尺寸未知 | 每个袋口的中心、轮廓和有效开口尺寸，附坐标/截图 | 未运行 |
| D-08 | 坐标误差容差 | 尚未定义 | 由项目需求和测量精度共同确定；记录测量残差 | 未运行 |

### 放行规则

- 在 D-01 至 D-05 未通过前，不要把当前自动拟合参数用于物理仿真或精确击球规划。
- 球半径、袋口几何和误差容差未确认前，不要宣称球体碰撞、进袋判定或候选击球几何准确。
- 如果 GLB 没有清楚的可击球表面几何，下一步应采用人工标注/校准数据定义活动台面，而不是继续猜测包围盒内缩量。
- 每次标定都应保存输入模型 SHA-256、变换参数、标定点、残差和验证日期，以便模型资产变化时重新验证。

## 9. 本地验证记录（追加，不覆盖历史）

### 运行记录模板

每轮复制以下模板并填写真实结果：

```text
运行编号：
日期/时区：
执行者（Codex / 人工）：
OS / 版本：
Node / pnpm / Python / Blender（如有）版本：
Git 分支：
Git HEAD：
工作区初始状态：
本轮修改文件：
执行的检查 ID：
实际命令/操作：
退出码：
关键输出（保留原始错误摘要）：
证据文件路径（截图、日志、JSON 摘要）：
结果（PASS / FAIL / BLOCKED / NEEDS REVIEW）：
发现的问题：
尚未验证的事项：
下一步建议：
```

### 运行记录

#### R-000：建立验证基线

- 日期：2026-10-28
- 来源：ChatGPT 对 GitHub 仓库的只读检查
- 已知 GitHub main 基线：`6742e16c5a25fe090496882d03da664f8a832a1a`
- 已知事实：仓库包含前端工作台源码和预期 GLB 路径；前端依赖、测试脚本和说明文档存在。
- 未执行：用户本地命令、依赖安装、TypeScript 检查、Vitest、构建、lint、浏览器检查、GLB 二进制解析和几何标定。
- 结论：这只是交接基线，**不构成任何本地验证通过的证据**。
- 状态：A-01 至 D-08 全部 NOT RUN。

#### 后续记录

> 每次 Codex 完成一轮本地验证后，在此处新增 R-001、R-002……，粘贴真实命令、退出码、关键输出与证据路径。不要删除 R-000 或把未执行项目改成 PASS。

#### R-001：首轮本地验证（环境阻塞，未放行标定）

- 日期/时区：2026-10-28，Asia/Shanghai；执行者：Codex。
- 环境：macOS 15.7.7 (24G720)，arm64；Node v24.12.0，pnpm 11.25.0，Python 3.13.7。Node 满足 `^22.18.0 || >=24.12.0`。
- Git：`main`，HEAD `b9609af516d2c9f88dfc35c6751a75fe9d9c60ef`。初始 `git status --short` 输出为空；`git status --short --branch` 输出 `## main...origin/main`；`git diff --stat` 输出为空，均退出 0。
- 已读取：根目录和 apps/web 的 AGENTS.md、README.md、本文档；另读取 docs/AGENTS.md、docs/plan/AGENTS.md、系统架构与启动、视觉输入与标准状态契约、API与流式消息，以及真实场景组件、工作台组件和两份前端测试。
- 变更范围：只追加本文档；业务源码、package.json、GLB、fixture 和标定参数均未修改，也未执行 commit、reset、clean、自动修复或暂存。
- 安装副产物：新增未跟踪 `.pnpm-store/`（包含 v11/index.db、index.db-wal、index.db-shm）；保留，没有删除。未生成 `apps/web/pnpm-lock.yaml`，未建立可用的 `apps/web/node_modules`。Python 测试新增未跟踪的 `python/billiards_core/billiards_core/__pycache__/`、`python/billiards_core/tests/__pycache__/`，均保留。
- 证据目录：`/tmp/eightball-r001/`。这是本机临时证据，重启/清理可能丢失；关键结果已在下文内联保留。没有上传模型或证据。

**A 阶段：实际命令、退出结果**

基线明细：`/tmp/eightball-r001/baseline.json`。以下命令 cwd 为仓库根目录。

| 命令 | 退出码 | 关键输出 |
|---|---|---|
| `git status --short` | 0 | （空） |
| `git rev-parse --show-toplevel` | 0 | /Users/fanwei/Downloads/04_宝藏集散地/code/test/eightball-ai |
| `git branch --show-current` | 0 | main |
| `git rev-parse HEAD` | 0 | b9609af516d2c9f88dfc35c6751a75fe9d9c60ef |
| `sw_vers` | 0 | ProductName:		macOS / ProductVersion:		15.7.7 / BuildVersion:		24G720 |
| `uname -m` | 0 | arm64 |
| `node --version` | 0 | v24.12.0 |
| `pnpm --version` | 0 | 11.25.0 |
| `python --version` | 0 | Python 3.13.7 |
| `command -v blender` | 1 | （空） |
| `git ls-files --stage apps/web/public/model/billiards.glb` | 0 | 100644 d154ea26f0391a08b22829ac978c0d4cc8ea8db8 0	apps/web/public/model/billiards.glb |
| `git status --short -- apps/web/public/model/billiards.glb` | 0 | （空） |

`command -v blender` 未找到 PATH 内命令；继续检查已安装 App，`/Applications/Blender.app/Contents/MacOS/Blender --version` 退出 0，版本为 **Blender 5.2.1 LTS**。输出包含 USD `ArchWarn: ARCH_CACHE_LINE_SIZE != Arch_ObtainCacheLineSize()`，保留在 check-10.log；本轮没有用 Blender 导入/渲染，不把版本检查算作模型加载验证。

| ID | 实际命令（除注明外 cwd=apps/web） | 退出码/实际结果 | 状态、证据 |
|---|---|---|---|
| A-01 | 上述 Git 基线命令 | 全部 0，初始干净 | PASS；baseline.json |
| A-02 | `node --version`、`pnpm --version` | 均 0，版本符合要求 | PASS；baseline.json |
| A-03 | `pnpm install` | 1；registry 请求 ENOTFOUND，最终 ERR_PNPM_META_FETCH_FAIL | BLOCKED；install.log、install.exit |
| A-03 重试 | `pnpm install --fetch-retries=0`（申请并获得沙箱外网络执行） | 1；GET https://registry.npmjs.org/@types%2Fjsdom: fetch failed | BLOCKED；install-network.log、install-network.exit |
| A-04 | `pnpm type-check` | Python 子进程 returncode=-15（SIGTERM，shell 通常记 143）；15 秒超时后终止本次进程组 | BLOCKED；check-4.log |
| A-05 | `pnpm exec vitest run` | Python 子进程 returncode=-15（SIGTERM，shell 通常记 143）；15 秒超时后终止本次进程组 | BLOCKED；check-5.log |
| A-06 | `pnpm build` | Python 子进程 returncode=-15（SIGTERM，shell 通常记 143）；15 秒超时后终止本次进程组 | BLOCKED；check-6.log |
| A-07 | `pnpm exec oxlint .` | Python 子进程 returncode=-15（SIGTERM，shell 通常记 143）；15 秒超时后终止本次进程组 | BLOCKED；check-7.log |
| A-08 | `pnpm exec eslint .` | Python 子进程 returncode=-15（SIGTERM，shell 通常记 143）；15 秒超时后终止本次进程组 | BLOCKED；check-8.log |
| A-09 | 根目录：`PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v` | 0；Ran 11 tests in 0.001s / OK | PASS；check-9.log |

- 五项前端命令均已发起，但 pnpm 在缺少依赖时先进入自动安装/解析，持续出现 registry `ENOTFOUND`；未实际完成 vue-tsc / Vitest / Vite build / Oxlint / ESLint，不能判定源码通过或失败。日志中的部分 resolved 版本只是未完成解析的进度，不能视为已安装依赖版本。
- 首次未设超时的 `pnpm type-check` 因重复网络等待被 Ctrl-C 中断，外层执行器退出 130（KeyboardInterrupt）；随后用有 15 秒预算的执行器重试上述五项，returncode=-15 的含义如表，未伪造自然退出码。
- 网络诊断：根目录 `curl -I --connect-timeout 10 https://registry.npmjs.org/three`，退出 **6**，`curl: (6) Could not resolve host: registry.npmjs.org`；registry.log、registry.exit。放开沙箱限制的 pnpm 重试也失败，根因仍需排查 DNS/网络/包管理器环境。
- checks.json 记录每项真实 cwd、命令、returncode、是否超时和完整输出。没有执行任何带 `--fix` 的 lint 命令。

**B 阶段：二进制、场景与坐标证据**

- B-01 **PASS**：`apps/web/public/model/billiards.glb` 已被 Git 跟踪（blob `d154ea26f0391a08b22829ac978c0d4cc8ea8db8`）；文件状态无修改。字节数 **16,891,564**；SHA-256 **`39f545f0f092c569b14d83c5eb1885a574484e8a4c04612cbfd05349101e0e0b`**；mtime `2026-10-28T03:45:25.469586+00:00`（北京时间 11:45:25）。
- 容器解析实际使用根目录内联 `python3 - <<'PY'`，通过标准库 pathlib/struct/json/hashlib 解码（退出 0）。magic=`glTF`，version=2，声明长度与实际长度一致；JSON chunk offset=12 / length=37012，BIN chunk offset=37032 / length=16854524，边界合法且无尾部残留。摘要在 glb-container.json；完整 JSON chunk 在 glb.json。
- 可重跑几何命令：根目录 `python3 /tmp/eightball-r001/inspect_glb.py`，退出 **0**；输出 glb-geometry.json、glb-geometry.log。脚本使用标准库解码 FLOAT/VEC3 顶点，并逐节点合成 TRS/矩阵；同时分开计算逐顶点世界包围盒与应用默认 Box3 的局部 AABB 八角变换近似。
- 额外完整性/三角探测命令：根目录 `python3 /tmp/eightball-r001/surface_probe.py`，退出 **0**；输出 surface-probes.json、surface-probes.log。该脚本还检查 bufferView 边界、索引范围、顶点有限值、POSITION min/max 和点状零尺寸网格。
- B-02 **PASS（结构检查范围）**：1 scene、35 nodes、33 meshes、33 primitives、16 materials、118 accessors、121 bufferViews、1 BIN buffer、3 JPEG images / 3 textures。33 个 POSITION accessor 全部实际解码；没有发现非有限坐标、POSITION min/max 不一致、越界索引、越界 bufferView 或点状零尺寸网格。没有外部 buffer/image URI，图片均通过 bufferView 内嵌。不是完整 Khronos Validator 报告，也没有执行纹理解码或 shader 检查。
- 场景根为 `Table`（node 17，children 0–16）及 `Balls`（node 34，children 18–33）。Table 下为 Table.001–Table.016 与 TableSurface；Balls 下含 Ball_0–Ball_15（按文件原始排序）。所有节点的 TRS、层级、每个网格/材质名、POSITION accessor 数量/type/min/max、世界矩阵与包围盒均见 glb-geometry.json。
- `Table` scale=(0.2478842735,0.2478842735,0.2478842735)，translation=(-0.0016712549,0.8135535717,0)；`Balls` rotation=(0,-0.7071068287,0,0.7071067095)，translation=(-0.6801862717,0.8799822330,-0.0023763739)。部分节点带非均匀缩放，例如 Table.015=(0.0523948185,4.0341405869,4.1702666283)，需结合建模意图复核，不能仅凭该值判模型损坏。
- 唯一没有显式 material 的 primitive 为 `/Table/Table.016`（mesh 15，13 个顶点），记录为默认材质路径；不将其视作容器损坏。该网格 Y 尺寸为 0，是平面几何，不是点状零尺寸。

| 坐标范围 | min (X,Y,Z) | max (X,Y,Z) |
|---|---|---|
| 未合成节点变换的局部 POSITION 合集（不可作为球桌尺寸） | (-143.868484,-63.265392,-131.880615) | (143.489883,23.041910,70.577133) |
| 合成 GLB 节点变换后的精确世界范围 | (-1.435375,0.007013,-0.785023) | (1.438209,0.888216,0.779396) |
| 现有应用拟合后的整体外框范围（代码重算） | (-635,0,-1270) | (635,747.135093,1270) |

- GLB 原生世界尺寸约 **2.873584 × 0.881203 × 1.564418**，顺序 X/Y/Z。glTF 约定 Y-up、长度单位米，但文件中数值是否与真实球桌的米尺度一致未实测；绝不能直接当毫米。应用拟合后的数值只是应用场景尺度。
- B-03 **NEEDS REVIEW**：存在独立命名 `/Table/TableSurface`，mesh 16（`网格.10243`），material 14（`材质.019`，带内嵌纹理），POSITION accessor 64，5188 个顶点。原生世界范围 min=(-1.357513,0.761968,-0.710524)、max=(1.360347,0.867645,0.705771)，明显不是单一高度平面，不能把整个 TableSurface 包围盒当活动台呢矩形。拟合后该网格范围约 X=[-575.231,574.522]、Y=[640.095,729.694]、Z=[-1201.177,1201.177]。
- 库边/框架/支架及袋网候选分散在 Table.002–Table.014；其中 Table.003 材质名 qiuwang.001、Table.009 绳子.001 只是识别线索。没有标为六个独立袋口的节点，也没有以命名确认的碰撞代理；无法仅凭名称排除装饰/隐藏用途。没有提取或声称六袋口中心/有效开口、四条真实台呢边界，需 Blender/真实渲染人工辨识。
- **模型内置球会影响拟合**：Balls 子树含 16 个球网格，整体最高点来自 Ball_0（原生 Y=0.8882159864），高于球桌主体。现有代码加载整个 gltf.scene 且另建 16 个 vision-ball；内置球没有被过滤。这是资产/代码路径证据，浏览器中最终叠加外观尚未验证。
- B-04 **NEEDS REVIEW**：现有代码按整体包围盒最长水平轴自动绕 Y 旋转 -π/2。原生 +X → 场景 +Z → 当前物理 +Y；原生 +Z → 场景 -X → 当前物理 -X；原生 +Y → 场景 +Y。该映射由代码重算，视觉来源的真实正方向未确认。
- 现有应用拟合参数重算：scale=(811.8032661,847.8585101,883.9137540)，translation=(-2.28383094,-5.94639704,-1.25228110)，先旋转再缩放/平移。水平缩放比 scaleZ/scaleX=1.08882754，比例改变约 8.88%；它把整体模型外框拟合为 1270×2540，未测得活动台呢的真实尺寸。
- 临时台面高度=711.135093，新增球中心 Y=739.710093（半径=28.575）。逐三角形在 TableSurface 上做竖直射线探测，中心 (0,0) 交点 Y=696.940699；样例 ID 0、3、10、12、13、14 也在该高度相交，球底比交点高 **14.194394 场景单位**。其他 10 个样例坐标没有与该网格相交。结果证明当前整体外框拟合/高度估计存在不一致证据；交点的台呢语义、可击球区域和真实毫米误差仍需人工确认，不能替代 C-04 的真实渲染验收。

**C 阶段：实际启动与浏览器结果**

- 按用户要求全部通过 Spark 本地项目管理平台：先 `list_projects({})` 确认未登记，`detect_project` 识别 apps/web；`create_project` 登记 eightball-ai，ID=`p_01047fdd`，终端 ID=`t_97940029`。未改写仓库启动配置。
- `control_project({project:"p_01047fdd",action:"start",waitMs:1500})` 实际启动命令为 apps/web 下 `pnpm dev --host localhost --port 5173`。终端退出 **1**，项目状态 failed、pid=null、无监听端口。保留该平台登记供后续使用，没有重启其他项目。
- `get_logs({project:"p_01047fdd",tail:100})` 获取全部 45 行日志，证据 spark-logs.json。关键错误：`Local package.json exists, but node_modules missing`；`Could not resolve vite / @vitejs/plugin-vue / vite-plugin-vue-devtools`；`Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'vite'`。
- Chrome 实际打开 `http://localhost:5173`，浏览器返回 `net::ERR_CONNECTION_REFUSED`；读取错误页确认“localhost 拒绝了我们的连接请求”。操作结果不是 shell 退出码，记 N/A。截图 `/tmp/eightball-r001/browser-refused.png`，页面文本 `/tmp/eightball-r001/browser-state.txt`。
- C-01–C-08 **全部 BLOCKED**：未到达应用页面，无法确认真实 GLB 请求成功、ready/fallback、模型完整性、OrbitControls、球体叠加、选择/ID、有效/越界/非数字/空值编辑、恢复状态，以及应用 Console/Network/WebGL/shader 错误。没有将错误页或静态代码读取当作浏览器验证通过。

**D 阶段：放行状态**

| ID | 状态 | 原因/所需后续证据 |
|---|---|---|
| D-01 | NEEDS REVIEW | 2540×1270 仍是假设，需真实规格与活动台呢四边测量 |
| D-02 | NEEDS REVIEW | 当前居中的是模型整体外框，需四边定义真正台面中心 |
| D-03 | NEEDS REVIEW | 代码轴映射已算出，需视觉坐标已知点和俯视截图确认正方向 |
| D-04 | NEEDS REVIEW | 当前矩阵已重算，但无已知点残差测试，不是已标定变换 |
| D-05 | NEEDS REVIEW | 临时表面高度与候选表面交点相差约14.194，需确认台呢真正表面 |
| D-06 | NEEDS REVIEW | 半径28.575没有项目实际球规格或测量依据 |
| D-07 | NEEDS REVIEW | 六袋口轮廓/中心/有效开口未标注，需人工辨识/测量 |
| D-08 | NEEDS REVIEW | 误差容差未定义，无残差验收标准 |

**结论与交接给 ChatGPT 的问题**

- 已通过：A-01、A-02、A-09（11项核心测试）、B-01、B-02 的离线结构检查。
- 失败操作：两次依赖安装退出1；registry诊断退出6；Spark开发服务器启动退出1。它们造成环境阻塞，不能据此声称业务测试失败。离线发现高度/覆盖范围不一致，需作为标定问题处理。
- 阻塞：A-03–A-08、C-01–C-08。前端五项检查已发起但真正检查工具未完成，前端测试通过数量未知。
- 待人工确认：B-03、B-04、D-01–D-08；当前不放行物理仿真或精确击球规划。
- 建议交给 ChatGPT：① 如何排查本机 npm DNS/网络和 pnpm 自动依赖解析，并在不改依赖版本的情况下建立可复现锁文件；② 如何在加载层处理 GLB 自带 Balls 子树，避免影响拟合与重复展示（本轮不实施）；③ 如何以 TableSurface 实际三角形/人工标注定义四边和六袋口，取代整体包围盒拟合；④ 如何确认视觉坐标单位、原点、轴向，制定已知点与残差验收，并解释当前14.194高度差和10个点无交集；⑤ 网络恢复后重跑 A-03–A-08 与 C 全项，特别确认非数字/空值、矩形边界和恢复状态。

- 收尾检查：`git diff --check` 退出0；`git diff --exit-code -- apps/web data/samples packages/contracts` 退出0；再次用 Python hashlib 计算 GLB SHA-256 与上文一致。`git status --short` 退出0：仅本文档有已跟踪修改，新增未跟踪项为上述 .pnpm-store 和两处 __pycache__。`git diff --stat` 退出0，仅本文档变更。证据 `/tmp/eightball-r001/final-review.json`。

#### R-002：用户完成依赖安装后的前端与浏览器补验

- 日期/时区：2026-10-28，Asia/Shanghai；执行者：Codex。本轮承接用户“已经装好了，继续完成验证”的指令，仍只验证，不修业务代码、不替换 GLB、不调整标定参数。
- 开始前重新读取根目录 AGENTS.md、README.md、apps/web/AGENTS.md、apps/web/README.md 和验证记录。Git 仍为 `main`，HEAD `b9609af516d2c9f88dfc35c6751a75fe9d9c60ef`。
- 初始工作区：验证文档已有 R-001 修改；未跟踪 `.pnpm-store/`、`apps/web/pnpm-lock.yaml`、两处 Python `__pycache__/`。这些内容全部保留。`apps/web/node_modules` 已存在。本轮没有执行 install 或修改锁文件。
- Node v24.12.0、pnpm 11.25.0。用户先前安装命令的退出码未由本轮观测，记 N/A；依赖可用性由实际执行检查和启动确认，不能倒改 R-001 安装失败的历史。
- 实际依赖（`pnpm list --depth 0` 退出0）：three 0.186.1、@types/three 0.186.0、Vue **3.6.0-rc.13**、Pinia 4.1.0、vue-router 5.4.0、Vite 8.3.5、Vitest 4.1.12、TypeScript 6.0.3、vue-tsc 3.3.13、Oxlint 1.82.0、ESLint 10.13.0；完整28包清单见 `/tmp/eightball-r002/0.log`。Vue 实际安装的是 RC 版本，需要依赖稳定性审查，本轮没有升级/降级。
- 锁文件 SHA-256：`3dc9245952150f3ecf94a4c4781fc6709fb497c6951f0a58ddd770a26c3eb2ba`，检查前后读取一致。GLB SHA-256 仍为 `39f545f0f092c569b14d83c5eb1885a574484e8a4c04612cbfd05349101e0e0b`，R-001 的离线结构证据仍适用于该资产；本轮补充实际浏览器渲染证据。
- 证据目录 `/tmp/eightball-r002/`；临时目录可能被清理，关键输出在本文保留。`checks.json` 保存 cwd=apps/web 的命令、真实退出码和完整输出；`baseline-final.json` 保存 Git/环境和资产哈希复核结果。

**A 阶段补验（均已实际执行）**

| ID | 命令（cwd=apps/web） | 退出码 | 结果与关键输出 | 证据 |
|---|---|---|---|---|
| A-03 依赖可用性 | `pnpm list --depth 0` | 0 | PASS（仅依赖可用性；本轮未重跑安装） | 0.log |
| A-04 | `pnpm type-check` | 0 | PASS；vue-tsc --build | 1.log |
| A-05 | `pnpm exec vitest run` | 1 | **FAIL**；2 test files / 5 tests passed，但有1个未处理异常，不能判整轮测试通过 | 2.log |
| A-06 | `pnpm build` | 0 | PASS（有警告）；38 modules，built in 826ms | 3.log |
| A-07 | `pnpm exec oxlint .` | 1 | **FAIL**；PoolTableScene.vue:223:24 unicorn(no-useless-spread) | 4.log |
| A-08 | `pnpm exec eslint .` | 0 | PASS；无输出 | 5.log |

- Vitest 原始异常：`TypeError: sceneRef.value?.resetView is not a function`，`resetState src/views/TableStudioView.vue:116:19`；最近测试为 `restores the original sample after local edits`。现有测试的 PoolTableSceneStub 没有提供 resetView，而真实组件通过 defineExpose 暴露了 resetView。浏览器真实组件恢复样例正常（见 C-07），因此优先检查测试替身契约；本轮不修复、不隐藏异常。
- Oxlint 原始信息：`Using a spread operator here creates a new array unnecessarily`，对应 `for (const child of [...ballGroup.children])`。该循环内部会 remove(child)，后续修复需考虑遍历中修改 children 的行为，不能仅为消除 lint 机械删除快照并漏删子节点。
- 构建警告：`Some chunks are larger than 500 kB after minification`；TableStudioView chunk 为653.84 kB（gzip166.75 kB），主入口96.01 kB；构建成功不代表性能基准通过。
- A-09 本轮未重跑；R-001 同一HEAD的11项 Python 测试通过记录保留，未虚报新一轮执行。

**C 阶段：Spark 与 Chrome 真机检查**

- 通过 `get_project({project:"p_01047fdd"})` 确认配置；`control_project({project:"p_01047fdd",action:"start",waitMs:2000})` 启动成功。命令仍为 apps/web 下 `pnpm dev --host localhost --port 5173`，Vite 8.3.5 ready in359ms，监听5173；运行中进程没有最终退出码，记 N/A。Spark日志 `/tmp/eightball-r002/spark.json` 含 R-001 的旧错误及16:26:29之后的新启动成功日志，不能混淆。
- Chrome 实际打开 `http://localhost:5173/`。通过浏览器 CDP `Network.enable` 后 reload，读取 `Network.responseReceived` / `Network.loadingFailed`；证据 network.json 共43事件，hasMore=false、truncated=false，捕获窗口内无 loadingFailed。
- GLB 实际响应：`http://localhost:5173/model/billiards.glb`，**HTTP200 OK**，Content-Type=`model/gltf-binary`，Content-Length=`16891564`，远端`[::1]:5173`，不是 ServiceWorker、磁盘缓存或 fallback 页面。页面从“模型加载中”变为“模型已载入”。
- 通过画布真实鼠标点击/拖拽/滚轮和页面控件执行操作；截图与DOM比例略有差异，选球使用经画布尺寸核对的 CDP 客户端坐标，不直接调用组件函数或篡改应用状态。操作类工具结果不是 shell 退出码，统一 N/A。

| ID | 实际操作/观察 | 状态 | 证据（均在 /tmp/eightball-r002/） |
|---|---|---|---|
| C-01 | GLB网络200、页面ready，真实纹理/框架/球袋/腿部可见 | **PASS** | network.json、final.png、final-state.txt |
| C-02 | 初始斜视、俯视、旋转侧视可见台呢、六个袋口视觉位置、框架和支架；无整体离屏或资源缺失；相对真实桌的镜像/朝向无已知参考 | **NEEDS REVIEW**（可见性已检查，完整语义不能全判通过） | top.png、rotated.png、zoom.png、final.png |
| C-03 | 鼠标拖拽旋转、滚轮deltaY=-350缩放、俯视/切回3D、重置视角均产生相应画面变化并可复位 | **PASS** | view-before.png、rotated.png、zoom.png、reset.png、final.png |
| C-04 | 内置三角形球堆与样例球同时可见；多颗样例球中心落在库边/外侧，未满足“均在可击球表面附近”的验收 | **FAIL** | top.png、zoom.png；结合R-001的网格射线和高度差 |
| C-05 | 点击样例球显示VISION ID0和fixture坐标；点击画布空白取消选择；ID按钮可隐藏/恢复标签 | **PASS** | restored-coordinates.txt、ids-off.png、final.png |
| C-06 | 双轴合法编辑、矩形上界、越界、空值/非数字均验证；单轴编辑被原始另一轴精度触发stepMismatch拦截 | **FAIL**（部分路径通过，见下述最小复现） | edit-valid.txt、edit-outside.txt、edit-empty.txt、edit-boundary.txt、step-mismatch.json |
| C-07 | 修改后恢复原始样例，STATE v1、未选择、ID开启、默认3D、只读来源；重新选0号球核对原始X/Y | **PASS** | reset.png、restored-coordinates.txt、final-state.txt |
| C-08 | 查看浏览器控制台与网络，未捕获error/资源失败；捕获并解释Three阴影兼容警告 | **PASS（有已解释警告）** | console.json、network.json |

**C-06 实测详情与新增问题**

1. 选择 ID0，初始X=`-104.72715759277344`、Y=`-515.1940307617188`。将两轴填为10、20并点击“应用坐标”，显示STATE v2及“本地修改 · 未保存”，通过。
2. X填700并提交，浏览器 validity.valid=false、validationMessage=`值必须小于或等于 635。`，状态未提交；此路径由原生HTML输入约束提示，不是页面自定义越界文案。
3. X清空后按字母a，type=number拒收字母、value保持空；点击提交显示`请输入 X 和 Y 坐标。`，STATE保持v2。没有通过脚本注入非有限值。
4. 两轴填635、1270，提交成功，STATE v3。该检查仅证明代码允许矩形边界，不代表球体实体在真实台呢内合法。
5. 点击“恢复原始样例”，状态回v1、清除选择、恢复ID开关/视角；重新选ID0，原始X/Y与步骤1一致。
6. **最小失败复现**：恢复原始样例 → 选择ID0 → 只把X改成10，保留Y原始值 → 点击应用。Y的`validity.stepMismatch=true`，提示`请输入有效值。两个最接近的有效值分别为-515.2和-515.1。`，状态仍v1。X/Y输入框均声明step=0.1，而fixture保留更高精度；这是实际浏览器行为，原有单元测试的直接form.submit触发方式没有覆盖原生约束校验。

**渲染警告与几何人工确认**

- 控制台警告：`THREE.WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead.`。当前代码PoolTableScene.vue:350设置PCFSoftShadowMap，实际安装three/src/renderers/webgl/WebGLShadowMap.js:101包含相同回退告警。本轮真实渲染未失败，但阴影配置与实际版本需后续对齐。
- 浏览器截图明确显示GLB自带的三角球堆；因此R-001关于内置Balls子树与新增16球叠加的判断已有实际渲染证据。
- B-03/B-04、D-01–D-08仍为 **NEEDS REVIEW**：截图能辨认六袋口视觉位置，但没有人工标注四条台呢边界、袋口有效轮廓/尺寸、视觉已知点、真实球规格或误差容差；没有据截图伪造精确坐标，也未改动14.194场景单位高度差或8.88%比例变化的参数。C-04失败不能因资源加载成功而解除。
- 本轮无原先依赖/浏览器访问类BLOCKED项；尚需人工的几何语义与标定明确保持NEEDS REVIEW。完整Khronos资产规范校验、生产浏览器性能与全设备可访问性审计未执行，未声称通过。
- 自动化辅助过程：按AX呈现的checkbox角色用Playwright定位ID开关时出现一次selector deadline exceeded（no matches）；读取DOM确认它实际是aria-pressed按钮后按button角色完成操作。初次选球点位未命中，经截图/DOM比例校正后成功。这些是自动化定位问题，未当成产品失败。

**收尾与交接建议**

- 本轮只追加本验证文档；构建生成被忽略的dist/和类型检查缓存，用户提供的锁文件与现有工作区内容均保留。未提交Git；未修改业务、测试、依赖声明、模型或标定参数。
- `git diff --exit-code -- apps/web data/samples packages/contracts`退出0；`git diff --check`退出0；GLB与锁文件哈希复核一致。`git status --short --branch`退出0，已跟踪修改仍仅验证文档；未跟踪项仍是本轮开始时列出的4类。证据baseline-final.json。
- Spark开发服务保持运行，浏览器最终已恢复原始样例v1、未选球、ID显示、默认视角，便于人工查看 `http://localhost:5173/`。
- 建议交给ChatGPT按问题独立安排后续修复：①补齐场景测试替身resetView接口并消除Vitest未处理异常；②解决Oxlint规则与遍历删除children之间的冲突，验证不漏删球/标签；③处理GLB内置球和真实台呢/袋口标定，修正样例球落库边/高度差；④协调编辑步长与fixture精度并补真实浏览器约束测试；⑤审查Vue RC依赖、Three阴影回退及构建大chunk警告。本轮不实施上述修复。

#### R-003：用户澄清活动区域尺寸与模型来源（人工输入，非新一轮运行验证）

- 日期/时区：2026-10-28，Asia/Shanghai。
- 用户明确确认：**2540 × 1270 mm 是内包边活动区域尺寸，不是球桌外框尺寸**；附件红框标出了该活动区域。用户同时说明球桌资料/模型由官方球桌厂家提供。此处记录为用户提供的规格与来源依据，未独立核验厂家文件。
- 附件参考：`/var/folders/4d/vk0yzq7j1r7_6zp4nvc4hwj40000gn/T/codex-clipboard-c46c0540-c5bc-4533-b3c1-15a5005479dd.png`。红框用于确认区域语义；截图没有被用作无透视误差的精确几何测量。
- 对此前结论的澄清：样例球落库边、比例/高度不一致，指向**应用当前把整体模型外包围盒拟合为活动区域尺寸的映射方式**，不能据此认定厂家GLB的球桌几何有问题；无需以替换模型作为解决前提。
- D-01拆分记录：活动区域目标规格2540×1270 mm及其内包边语义已获用户确认；该区域在GLB中的准确边界、中心及模型到场景的变换仍为 **NEEDS REVIEW**。不能把规格确认等同于几何映射已验收。
- 后续标定应以模型中与用户红框对应的活动区域为尺度依据，保留外框/库边在该区域外的正常尺寸；表面高度、轴向与已知点对应另行验证。当前没有改动模型、代码或标定参数，也未实施新的测量。

#### R-004：移除按活动区域尺寸强制拟合模型

- 日期/时区：2026-10-28，Asia/Shanghai。用户明确授权“把这个尺寸移除掉，我来控制模型尺寸”。此前“仅验证”限制由本次具体修改指令更新；现有工作区内容全部保留。
- 开始前 `git status --short` 退出0：仅验证文档有已跟踪修改，另有用户锁文件、.pnpm-store和两处__pycache__。读取实际场景代码、测试、模块README和坐标契约后执行最小修改。
- 修改文件：`apps/web/src/components/PoolTableScene.vue`（删除按1270/2540计算scaleX/scaleZ/平均scaleY的拟合，改为统一米转毫米）；`apps/web/src/views/TableStudioView.vue`（更新提示）；根README和apps/web/README（同步行为）；本文档追加记录。
- 设计决定：GLB各轴统一乘1000，仅换算glTF米→场景毫米，保留资产尺寸及比例；不再由活动区域宽/长决定模型缩放。仍保留已有最长水平轴旋转、居中、落地，以及顶部减36mm的临时表面高度。球尺寸、样例、坐标契约、fallback台面和输入边界未改；界面的2540×1270说明仍表示坐标输入的内包边区域，不控制真实GLB尺寸。用户在源模型改变尺寸后，应用不再将其重新拟合回固定长宽。
- GLB SHA-256仍为`39f545f0f092c569b14d83c5eb1885a574484e8a4c04612cbfd05349101e0e0b`；锁文件SHA-256仍为`3dc9245952150f3ecf94a4c4781fc6709fb497c6951f0a58ddd770a26c3eb2ba`。均通过Python hashlib实际重算，未改资产、依赖或锁文件。
- 本轮命令与完整输出：`/tmp/eightball-r004/checks.json`。所有pnpm命令cwd=apps/web，无自动修复。

| 实际命令 | 退出码 | 结果/证据 |
|---|---|---|
| `pnpm type-check` | 0 | PASS；0.log |
| `pnpm exec vitest run` | 1 | FAIL（既有）；2文件5测试断言通过，仍有sceneRef.value?.resetView is not a function未处理异常；1.log |
| `pnpm build` | 0 | PASS，有大chunk警告；TableStudioView 653.74kB；2.log |
| `pnpm exec oxlint .` | 1 | FAIL（既有）；PoolTableScene.vue:220:24，unicorn(no-useless-spread)，行号因本次删除代码移动；3.log |
| `pnpm exec eslint .` | 0 | PASS；4.log |
| 根目录 `node /tmp/eightball-r004/model-scale.mjs` | 0 | PASS；model-scale.json、model-scale.log |

- 临时几何验证脚本从当前组件提取真实addModel函数并用已安装Three.js执行：尺寸因子0.001、1、10均保留各轴统一1000换算和原始比例；空模型及零尺寸模型均按已有错误路径抛出“模型包围盒尺寸无效”。共5个检查通过，涵盖正常、尺度边界与无效模型；脚本未进入产品源码。本轮没有修复既有Vitest/Oxlint失败。
- Spark `get_project({project:"p_01047fdd"})`确认服务仍在运行、监听5173；沿用Vite HMR，无启动/重启操作。Chrome刷新localhost:5173后实际出现“模型已载入”，俯视和重置视角均可操作；模型及球体可见，原始比例下球桌外框不再等同输入矩形尺寸。操作返回成功，非shell退出码记N/A。截图`/tmp/eightball-r004/top.png`、`final.png`；页面状态`page.txt`；控制台采样`console.json`。
- 尚未验证/已知限制：真实台呢四边、袋口、坐标正向、球半径、临时高度仍需标定；极大/极小资产的相机和灯光范围没有自适应。临时几何脚本覆盖缩放行为，不代表极端尺寸在浏览器可完整取景。仍保留GLB自带球及当前样例叠加；未声称已解决所有标定问题。
- 收尾：`git diff --check`退出0。未提交、暂存、清理或覆盖用户原有改动。下一步由用户控制源模型尺寸，之后可另行确认台呢高度和视觉坐标映射。

#### R-005：让新增球体贴近模型台面

- 日期/时区：2026-10-28，Asia/Shanghai。用户授权降低球体相对桌面的高度。开始前`git status --short`退出0，保留R-004及此前全部改动。
- 修改：PoolTableScene.vue在模型统一单位换算、更新世界矩阵后，从名为TableSurface的网格包围盒中心向下发射射线，以实际三角面交点作为tableSurfaceY；球心仍为tableSurfaceY+28.575。缺少网格/中心射线未命中时保留原估计并输出警告。同步更新TableStudioView.vue提示及apps/web/README.md。未改模型尺寸、X/Y坐标或GLB。
- 实测几何：使用当前addModel函数和GLB全部顶点/索引/节点TRS重建（纹理不参与），原估计球底Y=845.202564，新球底Y=822.001184，降低约**23.201380场景毫米**；球心Y=850.576184。统一模型scale仍为(1000,1000,1000)。这是当前可视化台面交点依据，不代表真实物理参数已经标定。
- 根目录`node /tmp/eightball-r005/surface-height.mjs`退出0：正常平面贴合、缺少TableSurface回退、射线未命中回退、实际GLB贴合共4项通过；证据surface-height.json、surface-height.log。临时脚本提取并执行真实组件函数，没有添加产品依赖。
- cwd=apps/web：`pnpm type-check`退出0；`pnpm build`退出0（已有大chunk警告）；`pnpm exec eslint .`退出0；`pnpm exec vitest run`退出1（原有5断言通过但resetView替身未处理异常）；`pnpm exec oxlint .`退出1（原有no-useless-spread）。完整输出及退出码`/tmp/eightball-r005/checks.json`、0.log至4.log；没有将已有失败改记通过。
- 浏览器：沿用Spark管理的运行中服务与Vite热更新，Chrome刷新localhost:5173，实际显示“模型已载入”；放大观察新增球体已降低到台面附近，没有进入fallback。截图`/tmp/eightball-r005/final.png`，控制台采样console.json；操作结果成功，非shell退出码记N/A。
- 限制：当前按中心处水平高度摆球，不支持倾斜/起伏台面的逐球高度；六袋口、库边、真实规格和坐标映射仍需另行验收。未动用户GLB内置球，也没有声称解决其余既有问题。
- `git diff --check`退出0。保留工作区改动，未提交、暂存或清理。

#### R-006：修复测试未处理异常与Oxlint失败

- 日期/时区：2026-10-28，Asia/Shanghai。用户授权修复此前汇报的检查失败；保留已有工作区改动。开始前`git status --short`退出0，内容与R-005结束时一致。
- 修改文件：PoolTableScene.vue的clearBalls改为while循环逐个取末尾child再移除，避免直接遍历可变children导致跳项，同时去掉多余数组展开；TableStudioView.spec.ts补齐场景替身的resetView/setTopDownView公开接口、为mock声明函数类型、验证恢复时调用resetView并清除选中、新增俯视/切回/重置控件转发测试；本文档追加记录。未改模型、尺寸或球高行为。
- 首次修复后检查：type-check=0、Vitest=0（6项通过，无未处理异常）、build=0、ESLint=0、Python=0；Oxlint=1，新增mock触发vitest(require-mock-type-parameters)，随后补充`vi.fn<() => void>()`及`vi.fn<(enabled: boolean) => void>()`。原始日志`/tmp/eightball-r006/checks.json`及0.log至5.log保留。
- 修正mock类型后最终检查（cwd=apps/web）：`pnpm type-check`退出0；`pnpm exec vitest run`退出0，**2个文件、6项测试全部通过，无未处理异常**；`pnpm exec oxlint .`退出0；`pnpm exec eslint .`退出0。证据`/tmp/eightball-r006/final-checks.json`和final-0.log至final-3.log。
- `pnpm build`在本轮业务代码修复后退出0；TableStudioView chunk654.19kB，仍有既有500kB构建体积警告。之后只修改测试mock类型，生产代码未变，未无理由重复构建。根目录`PYTHONPATH=python/billiards_core python -m unittest discover -s python/billiards_core/tests -v`退出0，**11项通过**。
- 专项清理检查：根目录`node /tmp/eightball-r006/clear-balls.mjs`最终退出0。提取当前真实clearBalls函数，构造4球+4标签交错子对象（含材质数组）：8对象全部移除，12个材质/纹理dispose各一次，共享球几何未提前dispose；空组重复调用、null组均安全，两个映射清空。证据clear-balls.json、clear-balls.log。临时脚本初次直接在JS VM执行TS非空断言`!`出现SyntaxError: Unexpected token '!'，退出1；脚本去掉仅编译期的该断言后重跑通过，产品代码没有为临时脚本改写。
- GLB和用户锁文件哈希再次重算，分别仍为`39f545f0f092c569b14d83c5eb1885a574484e8a4c04612cbfd05349101e0e0b`、`3dc9245952150f3ecf94a4c4781fc6709fb497c6951f0a58ddd770a26c3eb2ba`。
- 本轮无UI布局/坐标逻辑修改，未重复浏览器整轮交互验收；几何标定和此前单轴输入精度问题不在本次两项失败修复范围。所有已执行工程检查最终通过，不代表这些独立问题已解决。构建体积警告仍保留，没有提高阈值来隐藏警告。
- `git diff --check`退出0；保留此前全部改动，无提交/暂存/清理。


## 10. 下一轮待验证任务（尚未执行）

### V-007：修复单轴坐标编辑的精度约束

- **状态：NOT RUN。** 这是待本地 Codex 执行的验证任务，不是通过记录；ChatGPT 网页端没有运行本地命令或浏览器。
- **问题依据：** R-002 实际浏览器复现了单轴编辑失败：保留原始高精度 Y 值、只修改 X 时，Y 输入触发 `stepMismatch`（最近有效值提示为 -515.2 和 -515.1）。原始视觉坐标包含超过一位小数的值，固定 `step="0.1"` 与源数据精度不兼容。
- **本次代码改动：**
  - `apps/web/src/views/TableStudioView.vue`：X/Y 数字输入改用 `step="any"`，保留已有 `min` / `max` 与应用层数字、边界校验，不对未修改轴做舍入。
  - `apps/web/src/__tests__/TableStudioView.spec.ts`：新增 X-only、Y-only 两条回归测试，检查未修改轴的原始值完全保留且状态版本递增。
- **本地自动检查（cwd=apps/web，逐项记录真实退出码）：**
  1. `pnpm type-check`
  2. `pnpm exec vitest run`
  3. `pnpm exec oxlint .`
  4. `pnpm exec eslint .`
  5. `pnpm build`
- **浏览器回归：** 启动 `pnpm dev`；选中检测 ID 0，记录 X/Y 原值；只改 X 为 10 并应用，确认版本增加且 Y 精确保持原值；恢复样例后只改 Y 为 20 并应用，确认版本增加且 X 精确保持原值。检查输入有效性没有 `stepMismatch`；同时确认超出 `[-635, 635]) 的 X 与 `[-1270, 1270]) 的 Y 仍不能提交。
- **结果要求：** 将本轮真实命令、退出码、关键输出、浏览器操作/截图路径及工作区状态追加为下一条运行记录（R-007）；未执行的项保持 NOT RUN，不把代码修改本身当作通过。
- **未纳入本任务：** GLB 自带球体的显示/包围盒处理、台呢四边与袋口标注、坐标轴方向和真实球半径仍需单独处理；本次不据此放行物理仿真。


## 11. 本地验证追加记录

#### R-007：单轴坐标编辑精度与边界回归

- 日期/时区：2026-10-28，Asia/Shanghai；执行者：Codex。环境：macOS 15.7.7 (24G720)、Node v24.12.0、pnpm 11.25.0；沿用已安装依赖，没有安装或调整版本。
- 初始 Git：`main`，HEAD `977c52fda3facaa035ce10e0ea8f1a38150c4ab4`；`git status --short --branch` 退出0，仅输出 `## main...origin/main`，工作区干净。
- 已读取根目录、apps/web 的 AGENTS.md / README.md、docs 的 AGENTS.md / README.md、全部历史验证记录，以及架构、视觉契约、数据字典和流式消息设计。通过 GitHub connector 读取 PR #1，确认实际三个文件的差异及远程 head。
- 切换目标分支：首次 `git switch --track origin/fix/single-axis-coordinate-step-20261028` 退出128，沙箱不允许创建 `.git/index.lock`；申请扩大执行权限后，同一命令退出0。没有强制切换、清理或覆盖文件。切换后工作区干净，分支 `fix/single-axis-coordinate-step-20261028`，HEAD `3e21c6b704a73d2fa4ad8929e74261a725372e3f`，与 PR head 及本地 origin 对应引用一致。
- 本轮修改文件：`apps/web/src/__tests__/TableStudioView.spec.ts` 补充12项参数化回归（四个边界、双轴上下越界、双轴空值和双轴字母输入）；本文档追加 R-007。已有两项单轴测试检查未修改轴精确数值及 STATE v2，符合要求，没有删减断言。
- 产品代码检查：`TableStudioView.vue` 两轴均为 `step="any"`；X 的 min/max 为 ±635，Y 为 ±1270；应用层保留空值、有限数字、矩形范围校验。无需进一步修改产品代码。测试直接触发表单提交验证应用层，浏览器通过点击提交按钮验证原生约束，两者分别取证。

**自动化检查：按要求顺序执行，cwd=apps/web**

| 实际命令 | 真实退出码 | 结果与关键输出 | 证据 |
|---|---|---|---|
| `pnpm type-check` | 0 | PASS；`vue-tsc --build`，无类型错误 | `/tmp/eightball-r007/1.log` |
| `pnpm exec vitest run` | 0 | PASS；2个文件、20项测试全部通过，无未处理异常；含原有 X-only / Y-only 及本轮12项回归 | `/tmp/eightball-r007/2.log` |
| `pnpm exec oxlint .` | 0 | PASS；无诊断输出 | `/tmp/eightball-r007/3.log` |
| `pnpm exec eslint .` | 0 | PASS；无诊断输出 | `/tmp/eightball-r007/4.log` |
| `pnpm build` | 0 | PASS（有警告）；Vite 8.3.5，38 modules，built in 404ms；TableStudioView 654.19kB / gzip166.91kB | `/tmp/eightball-r007/5.log` |

- 原始命令、退出码和完整输出另存 `/tmp/eightball-r007/checks.json`；以上由 Python subprocess 顺序执行并记录真实 returncode。构建保留原有 `Some chunks are larger than 500 kB after minification` 警告，没有修改阈值或隐藏警告。

**真实浏览器：V-007-01 至 V-007-03**

- Spark `list_projects({})` 确认项目 `p_01047fdd` / 终端 `t_97940029` 正在运行，沿用该平台管理的 `pnpm dev --host localhost --port 5173`，不重复启动进程。Spark 日志可见18:37:06对 TableStudioView.vue 的 HMR 更新；16:10旧失败日志属于历史启动，不代表本轮失败。
- 使用 Codex 内置真实浏览器访问 `http://localhost:5173/`，页面显示“模型已载入”；本地应用无需登录。使用页面按钮恢复样例、切换俯视，通过画布实际点击选择 ID0，没有调用组件内部函数或注入应用状态。DOM evaluate 仅只读提取输入值、validity和页面文字；所有提交均点击“应用坐标”。浏览器操作非 shell 命令，退出码记 N/A。
- 原始 ID0：X=`-104.72715759277344`、Y=`-515.1940307617188`。

| ID / 操作 | 实际结果 | 状态 |
|---|---|---|
| V-007-01：恢复样例→选ID0→只将X改10→应用 | STATE v1→v2；X=10，Y完整保留 `-515.1940307617188`；两轴valid=true、stepMismatch=false；另一次重复操作后取消选择并重新选ID0，确认提交后的状态仍是相同精确值 | PASS |
| V-007-02：恢复样例→选ID0→只将Y改20→应用 | STATE v1→v2；Y=20，X完整保留 `-104.72715759277344`；两轴valid=true、stepMismatch=false；重复操作并取消/重新选球，确认提交后状态保留精确值 | PASS |
| V-007-03：分别从原样例只改X=-635、635；只改Y=-1270、1270 | 四次均从v1到v2；未修改轴保持原始高精度，均valid=true、stepMismatch=false | PASS |
| V-007-03：分别X=-636、636；Y=-1271、1271→应用 | 原生rangeUnderflow / rangeOverflow=true、valid=false；版本保持v1；取消选择并重选ID0，双轴均为原值，未污染状态 | PASS |
| V-007-03：分别清空X、Y→应用 | 显示“请输入 X 和 Y 坐标。”，版本保持v1；取消选择/重选后原始坐标保持不变 | PASS |
| V-007-03：分别清空X、Y再按字母a→应用 | number输入拒收a，value保持空，应用提示“请输入 X 和 Y 坐标。”，v1不变；重新选球确认原始双轴不变 | PASS |

- 浏览器原始证据：`/tmp/eightball-r007/browser.json`（每次输入值、step/min/max、validity、完整页面文字）；截图 `/tmp/eightball-r007/x-only.png`、`y-only.png`、`y-only-committed.png`、`final.png`。这些是本机临时文件，可能被系统清理，关键结果已在本记录内联保留。
- 额外证据复核：根目录内联 `python3 - <<'PY'` 读取 browser.json 并断言单轴提交及重新选择后的精确值、v2、valid / stepMismatch，检查边界v2及非法输入v1、重新选择后的原始坐标，退出0，输出 `PASS: verified 26 recorded browser snapshots; exact single-axis values, versions, native validity and invalid-input state preservation.`。
- 资产复核：`shasum -a 256 apps/web/public/model/billiards.glb apps/web/pnpm-lock.yaml` 退出0，分别仍为 `39f545f0f092c569b14d83c5eb1885a574484e8a4c04612cbfd05349101e0e0b` 和 `3dc9245952150f3ecf94a4c4781fc6709fb497c6951f0a58ddd770a26c3eb2ba`，与此前记录一致。未修改GLB、球桌尺寸、半径、样例、坐标映射、依赖声明或锁文件。
- 最终状态：**PASS（仅本轮单轴坐标编辑范围）**；五项自动化、X-only、Y-only、矩形边界与非法输入均通过，无本轮未解决失败或阻塞。历史 R-000 至 R-006 和 V-007 待执行交接原文保留；上述本轮实际结果取代“待执行”的当前状态，不改写历史。
- 未验证/限制：本轮没有重做几何标定、物理参数、球体重叠或完整浏览器性能/可访问性审计；不因自动化或浏览器通过而放行几何标定。后续仍需单独确认真实台呢、袋口、轴向和球半径。构建体积警告继续保留。
- 收尾：`git diff --check` 退出0；复核差异仅本轮测试文件与本文档，未创建新提交、未推送或合并PR。分支及HEAD仍如上；工作区保留这两个文件的未提交修改。
