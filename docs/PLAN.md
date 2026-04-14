# High level steps for project

## Goals, scope, and quality gates

- Minimum deliverable: local Docker run with frontend + backend + fake auth + persistent user Kanban data + AI assistant.
- Unit coverage target: >= 80% for frontend and backend.
- Integration/e2e test criterion: at least one full user flow for login->view Kanban->edit card->AI chat must pass.
- Non-goal: production scaling, real user management, security hardening beyond MVP.

## Part 1: Plan (this document)

### [ ] 1.1 更新结构
- [x] 现有 Part 1-10 已列出。
- [x] 添加更细化的子步骤、测试和验收。
- [x] 明确 80% 单测覆盖率目标（前后端）。
- [x] 增加风险与预防措施。

### [ ] 1.2 设定交付验收标准
- [ ] 每个 Part 追加“完成后检查点”列表。
- [ ] 每个 Part 明确“测试要求”：单测/集成/端到端。

### [ ] 1.3 前端现有代码文档
- [x] 在 `frontend/AGENTS.md` 写当前组件/数据流说明。

### [ ] 1.4 获取用户批准
- [ ] 用户 review 并 sign-off 本计划。

## Part 2: Scaffolding

### 目标
- Docker Compose + FastAPI backend + static placeholder前端提供。

### 步骤
- [x] 在根目录创建 `Dockerfile` 与 `docker-compose.yml`。
- [x] `backend/` 初始化 `main.py`（FastAPI）、 `requirements.txt`、`app` 目录、数据库路径配置。
- [x] `scripts/start.sh`, `scripts/stop.sh`, `scripts/start.ps1`, `scripts/stop.ps1`。
- [x] 后端路由 `GET /health` 返回 200, `GET /hello` 返回 `Hello world`。
- [x] 后端静态服务 `GET /` 返回 `frontend` 生产构建内容或基本 HTML。
- [x] 本地验证 `docker compose up` 后 `curl localhost:8000/health`，`/hello`。

### 验收
- [x] `docker compose up` 启动成功。
- [x] 访问页面返回内容。
- [x] API 可以返回预期。

## Part 3: Add in Frontend

### 目标
- 将 `frontend/` 静态构建文件嵌入后端，展示现有 Kanban UI。

### 步骤
- [x] 前端构建命令 `npm run build` 且产物输出 `frontend`（Next.js standalone export）。
- [x] 后端静态文件服务到 `/`。
- [x] 确认Android端口访问时页面显示 Kanban（本地浏览器+Playwright）。

### 测试
- 单测：现有 `KanbanBoard.test.tsx`、`lib/kanban.test.ts` 通过。
- 集成：Playwright 访问 `/` 并验证 Kanban 渲染5列、默认卡片。

## Part 4: Fake auth

### 目标
- 访问 `/` 先显示登录页，使用 `user/password` 登录后进入 Kanban。
- 登录状态可以登出。

### 步骤
- [x] 前端路由 `/login` + `/`。
- [x] 前端状态存储 `localStorage` 或 context。
- [x] 保护页面：未登录重定向 `/login`。
- [x] 测试登录失败/成功消息。

### 测试
- 单测：login flow 组件行为，成功/失败状态。
- e2e：输入错误凭证失败，正确凭证成功；退出后回到 `/login`。

## Part 5: Database modeling

### 目标
- 设计 `user`, `kanban_board` (JSON) 兼容多用户。

### 数据模型草案
- `users(id TEXT PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT)`（MVP 简单明文或哈希）。
- `boards(id TEXT PK, user_id TEXT FK, data JSON, updated_at DATETIME)`。

### 步骤
- [x] 文档入 `docs/db_design.md` 或 `docs/PLAN.md`。
- [x] 辨识列/类型并生成 SQL DDL。

## Part 6: Backend API

### 目标
- API: `GET /api/boards/{user}`, `PUT /api/boards/{user}`、`POST /api/auth/login`（或置于前端）。
- 数据自动创建：用户不存在时插入默认板。

### 测试
- 单测：使用 TestClient 验证 API 行为 + db 文件迁移创建。
- 覆盖： >= 80% 后端。

## Part 7: Frontend + Backend

### 目标
- 前端 UI 真实调用后端 API 保存/加载 Kanban。

### 步骤
- [ ] 前端 `useEffect` 加载 board，持久化移动/增删等操作到后端。
- [ ] 每次修改后 `PUT`。
- [ ] 断电重启后状态保持。

### 测试
- e2e：登出登录、拖动卡片、保存、刷新后刷新状态。

## Part 8: AI connectivity

### 目标
- 后端路由 `POST /api/ai/test` -> OpenRouter (模型 `openai/gpt-oss-120b`) 返回AI结果。

### 步骤
- [ ] 读取 `.env` `OPENROUTER_API_KEY`。
- [ ] 测试 `2+2`。

## Part 9: AI structured output

### 目标
- 后端 `POST /api/ai/chat`，请求参数含 `kanban`、`question`、`history`。
- 模型输出包含 `response_text` + 可选 `board_update`。
- 若 `board_update` 存在，后端合并并写DB。

### 测试
- 单测+集成：模拟OpenRouter返回结构化 JSON，验证后端更新行为。

## Part 10: AI frontend widget

### 目标
- 侧边栏 AI 聊天；可发起消息、展示历史、应用模型建议卡片编辑。

### 测试
- e2e：打开 AI 侧边，询问“创建卡片：重构登录”，确保新卡出现在看板。

---

## 风险与缓解
- 风险：OpenRouter API 不可用 -> 单测使用 mock。
- 风险：Next.js静态导出路径问题 -> 先用简单HTML验证再复杂化。
- 风险：跨域与 cookie auth 问题 -> 初期纯前端 token 或 localStorage。

## 进度状态（请在每步完成后打勾）
- [x] Part 1: Plan (初始草案)
- [x] Part 2: Scaffolding
- [x] Part 3: Add in Frontend
- [x] Part 4: Fake auth
- [x] Part 5: Database modeling
- [x] Part 6: Backend API
- [x] Part 7: Frontend + Backend
- [x] Part 8: AI connectivity
- [x] Part 9: AI structured output
- [x] Part 10: AI sidebar widget
