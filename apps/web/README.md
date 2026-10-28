# Web 前端

## 当前状态

已从初始化脚手架推进到第一版球局工作台：

- 使用 Three.js GLTFLoader 加载 public/model/billiards.glb。
- GLB 加载后仅过滤已验证名称与层级的 `Balls`（16 个 `Ball_0`–`Ball_15`）内置球子树，避免与视觉球重复显示，并在计算模型包围盒前移除；未知结构保留原样并提示警告。
- 使用 OrbitControls 提供三维旋转、平移和缩放。
- 从仓库级 data/samples/table-state-001.json 读取标准球局样例，渲染 16 个视觉检测目标。
- 点击球体可选择目标；可查看并修改 X/Y 坐标，坐标修改只存在于当前浏览器会话。
- 坐标修改会增加 state_version；可恢复原始样例。
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
- 当前样例为单帧状态；编辑不会写回原始样例文件，也不会调用后端 API。

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

仓库尚未提交 pnpm-lock.yaml。新增 Three.js 后请在目标开发环境运行 pnpm install 并审查解析版本；本次没有生成锁文件或执行本地构建。

## 主要文件

- src/views/TableStudioView.vue：工作台布局、球局状态和坐标编辑。
- src/components/PoolTableScene.vue：GLB 加载、Three.js 场景、球体和视角交互。
- src/utils/modelAsset.ts：精确分离模型内置球与共享资源去重释放。
- src/data/initialTableState.ts：引用仓库级标准状态样例。
- src/types/tableState.ts：前端对标准球局状态的类型定义。
- src/assets/main.css：响应式工作台样式。
