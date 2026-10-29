# Web 前端

## 当前状态

已从初始化脚手架推进到第一版球局工作台：

- 使用 Three.js GLTFLoader 加载 public/model/billiards.glb。
- GLB 加载后仅过滤已验证名称与层级的 `Balls`（16 个 `Ball_0`–`Ball_15`）内置球子树，避免与视觉球重复显示，并在计算模型包围盒前移除；未知结构保留原样并提示警告。
- 顶栏显示真实 API 健康状态（连接中/已连接/未连接），3秒超时，失败可重试；API离线仍可使用本地球局。
- 使用 OrbitControls 提供三维旋转、平移和缩放。
- 从仓库级 data/samples/table-state-001.json 读取标准球局样例，渲染 16 个视觉检测目标。
- M1 首步支持本地导入 `TableState` v0.1.0 JSON：严格检查版本、字段、正数几何尺寸、检测 ID 唯一性、有限坐标、台面边界和可选置信度。失败保留当前球局，成功替换当前会话并递增状态版本；无网络上传。
- 点击球体可选择目标；可查看并修改 X/Y 坐标，坐标修改只存在于当前浏览器会话。
- PC 工作台高度随浏览器窗口限定，右侧球局面板独立滚动；选球、导入提示和错误信息不再撑高 3D 视窗。
- M1 支持 PC 二维顶视图拖拽移动现有检测目标；拖动一次只提交一次状态版本。键盘方向键移动 10 mm，Shift + 方向键移动 1 mm，并在活动台面边界内限位；视觉 ID 不是正式球号。
- 坐标修改会增加 state_version；版本递增前检查 JavaScript 安全整数上限，无法安全递增时拒绝修改并保留原状态；可恢复原始样例。
- 提供俯视视角、重置视角和检测 ID 标签开关。
- 若 GLB 加载失败，页面会显示简化球台以便继续检查坐标。

这不是物理仿真或 AI 规划器。可交互球体仍由标准球局状态产生；当前球体颜色仅用于区分视觉 ID，不代表真实球色或正式球号。移除内置装饰球也不表示台呢边界、坐标方向或物理尺寸已完成标定。

## 模型与坐标限制

- 坐标输入的活动区域为长度 2540 mm、宽度 1270 mm（用户确认指内包边区域），用于样例和坐标边界校验，不控制 GLB 尺寸。
- GLB 尺寸由资产本身控制；前端仅统一从 glTF 米换算为场景毫米（各轴同乘 1000），不再按 2540 × 1270 拉伸模型。修改模型尺寸请在源模型中调整并重新导出。
- 展示仍按最长水平轴旋转、居中并落地；台呢矩形、原点和朝向尚未完成标定。
- 球体贴合高度优先读取 TableSurface 网格中心的向下射线交点；球心位于该高度加可视化半径。没有该网格或未命中时才回退到模型顶部减 36 mm，并输出控制台警告。此方法供可视化使用，尚未完成物理标定。
- 球体显示半径 28.575 mm 仅用于可视化，尚未由项目提供方确认。
- 坐标方向沿用视觉契约中的 provisional 约定；未做自动镜像或坐标变换。
- 当前只校验坐标是否位于活动台面矩形范围内，不检查球体重叠、球袋几何或规则合法性。
- 当前样例为单帧状态；编辑和文件导入不会写回原始样例文件，也不会调用后端 API。
- 导入文件限制 1 MiB，需包含 `schema_version: "0.1.0"`、`table_id`、`state_version`、`source`、`coordinate_frame`、`table_geometry` 和 1–16 个 `balls`。接受可选 `confidence`，但不推断球号或碰撞是否合法。成功导入后本地版本设为 `max(当前版本, 文件版本) + 1`，旧选球清空；恢复样例仍回到原始 v1。
- 当前工作台仅允许导入活动区域与现有会话完全相同的球桌（默认 2540 × 1270 mm），避免 GLB 与后备球桌尺寸混淆；其它尺寸需要完成对应模型标定再支持。视觉正方向仍为 provisional。二维拖拽仅按标准状态活动区域映射，不证明 GLB 朝向已标定。轨迹 JSON / CSV 导入、时间戳和 200FPS 回放仍未实现，M1 尚未完成。

## 技术栈

Vue 3、TypeScript、Vite、Three.js、GLTFLoader、OrbitControls、Pinia、Vue Router、Vitest、Vue Test Utils、Oxlint、ESLint 与 oxfmt。Three.js API 按其官方 GLTFLoader / OrbitControls 文档实现。

## 本地运行

在 apps/web 目录执行：

- pnpm install：安装依赖。
- pnpm dev：启动开发服务器。
- pnpm type-check：类型检查。
- pnpm build：类型检查并构建生产产物。
- pnpm exec vitest run：执行前端测试。
- pnpm exec oxlint .：只检查，不自动修复。
- pnpm exec eslint .：只检查，不自动修复。

仓库已提交 pnpm-lock.yaml；使用 `pnpm install --frozen-lockfile` 保留锁定解析。Vue RC覆盖沿用既有配置，本轮未调整版本。

API默认 `http://localhost:8000`，可复制 `.env.example` 为 `.env.local` 后修改 `VITE_API_BASE_URL`（只允许HTTP(S) origin，不含路径和凭据）。该变量公开到浏览器，禁止存放密钥。默认API CORS允许localhost:5173及127.0.0.1:5173；更换端口需同步API允许列表。API启动方式见根README；本机服务通过Spark管理。

## 主要文件

- src/views/TableStudioView.vue：工作台布局、球局状态和坐标编辑。
- src/components/PoolTableScene.vue：GLB 加载、Three.js 场景、球体和视角交互。
- src/components/ApiHealthBadge.vue / src/utils/apiHealth.ts：API健康状态、超时和重试。
- src/utils/modelAsset.ts：精确分离模型内置球与共享资源去重释放。
- src/utils/tableStateImport.ts：根据共享 v0.1.0 JSON Schema 的字段约定校验导入，并补充 ID 唯一性、有限数值及边界领域检查。
- src/data/initialTableState.ts：引用仓库级标准状态样例。
- src/types/tableState.ts：前端对标准球局状态的类型定义。
- src/assets/main.css：响应式工作台样式。
