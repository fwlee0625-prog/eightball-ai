# API 服务

## 当前状态与接口

M0 已实现最小 FastAPI 服务：`GET /health` 返回HTTP 200及
`{"status":"ok","service":"eightball-api","version":"0.1.0"}`。
这是进程存活检查，不表示规则、物理、规划或模型推理已就绪。
`/docs`、`/openapi.json` 由 FastAPI 生成；其余业务路由与 WebSocket 尚未实现。

## 安装与运行

从仓库根目录执行，使用 Python 3.12 或3.13、uv 0.11.3：

```bash
uv sync --locked
uv run --locked uvicorn billiards_api.main:create_app --factory --app-dir apps/api --host localhost --port 8000
```

本机日常启动、停止、重启统一通过 Spark 项目管理平台，登记根目录和上述启动命令。
默认仅监听localhost。启动日志输出版本和CORS配置项数量，Uvicorn access日志记录请求状态。
当前没有生产部署、认证或公网暴露配置。

## 配置

根目录 `.env.example` 是无密钥示例。默认允许 `http://localhost:5173` 和
`http://127.0.0.1:5173` 的GET跨域请求，不启用凭据。
`EIGHTBALL_CORS_ORIGINS` 可设置为JSON数组，`[]`关闭跨域访问；路径、通配符、凭据及无效端口会在启动前明确报错。
本地`.env`不会自动读取；需要时复制示例并显式加载：

```bash
uv run --locked --env-file .env uvicorn billiards_api.main:create_app --factory --app-dir apps/api --host localhost --port 8000
```

浏览器地址或端口变化时同步修改允许的origin。CORS限制浏览器跨域读取，不代替身份认证。

## 验证

仓库根目录：

```bash
uv run --locked pytest -q
uv run --locked ruff check .
```

pytest涵盖API健康响应及共享JSON Schema、CORS允许/拒绝/预检、错误配置和既有核心坐标校验。
当前锁定FastAPI0.162.0、Starlette1.10.0、Uvicorn0.54.0；测试使用httpx0.28.1，
Starlette会发出建议改用httpx2的弃用警告，现有测试通过，后续依赖调整应独立审查。

## 边界与后续

健康响应契约位于 `packages/contracts/schemas/health-response.schema.json`。
API返回由Pydantic模型约束，测试用共享Schema校验生产者；前端消费者也使用该Schema常量校验。

球局提交、推荐、规划任务与WebSocket接口仍是设计草案。领域规则、几何、仿真和搜索属于
`python/billiards_core`；本模块仅负责HTTP边界、输入校验、任务编排和结果传输。

官方接口核对（2026-10-28）：[FastAPI 首步](https://fastapi.tiangolo.com/tutorial/first-steps/)、
[测试](https://fastapi.tiangolo.com/tutorial/testing/)、[CORS](https://fastapi.tiangolo.com/tutorial/cors/)、
[uv锁定与同步](https://docs.astral.sh/uv/concepts/projects/sync/)。以uv.lock实际安装版本和测试结果为准。
