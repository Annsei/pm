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

## Part 11: Multi-user, multi-board (iteration 1)

### 已完成
- [x] User 注册/登录：`POST /api/auth/register`、`/login`、`/logout`、`GET /me`。
- [x] bcrypt via passlib + SHA256 legacy 回退。
- [x] Session 表，Bearer token 鉴权。
- [x] Board 多看板：列表、创建、重命名、归档、删除、颜色标签、位置排序。
- [x] 前端 `BoardList` + `LoginForm` 注册模式。
- [x] `AiChatSidebar` 传 `board_id`（原 `user_id`）。
- [x] Backend pytest: 27 用例覆盖 auth/boards/AI，含跨用户权限校验。
- [x] Frontend vitest: LoginForm / BoardList / KanbanBoard，共 16 用例。
- [x] Playwright: `auth.spec.ts` 更新 + 新增 `boards.spec.ts`。

## Part 12: Card metadata & filtering (iteration 2)

### 已完成
- [x] `CardModel` 扩展 labels / priority / due_date，后端 Pydantic 校验。
- [x] AI `add_card`/`edit_card` action 接受并 sanitize 新字段。
- [x] 前端 `Card` 类型 + `PRIORITY_META` + `dueDateStatus` 工具（纯函数，单元测试）。
- [x] `CardDetailDialog` 弹窗：title/details/priority/due date/labels 编辑 + 删除。
- [x] `KanbanCard` 渲染优先级徽章、截止日期状态（overdue/today/soon/later）、标签 chips。
- [x] `BoardFilters` 顶部筛选栏：全文搜索、优先级、标签、仅显示有 due date。
- [x] Pytest 新增 4 个测试；vitest 新增 13 个测试（总数 31 + 29 = 60 全部通过）。

## Part 13: Activity log & profile management (iteration 3)

### 已完成
- [x] `activity_log` 表 + `record_activity()` 助手；Python 端微秒时间戳保证顺序。
- [x] `diff_board_data()` 将前后看板 JSON 对比成 card_add / card_delete / card_move / card_edit / column_rename 事件。
- [x] Boards 路由：create / patch / PUT / seed 均记录活动；AI chat 也记录，`meta.source = "ai"`。
- [x] `GET /api/boards/{id}/activity?limit=&before=` 鉴权到 owner。
- [x] `PATCH /api/auth/me` 更新 display_name/email/密码（当前密码校验 + 冲突 409）。
- [x] 前端 `listBoardActivity` / `updateProfileApi` + `ActivityEntry` 类型。
- [x] `ActivityDrawer` + Activity 按钮挂到看板 header；折叠右侧抽屉共用空间。
- [x] Pytest 新增 18 个测试（49 共 31→49 全通）；vitest 新增 9 个测试（29→38 全通）。

## Part 14: Board sharing & collaboration (iteration 4)

### 已完成
- [x] `BoardCollaborator` 表（board_id, user_id, role={viewer,editor}, added_by, created_at）+ `(board_id, user_id)` 唯一约束。
- [x] `backend/permissions.py`：`get_board_with_role()` 返回 `(board, role)`，无权限的非协作者收 404（隐藏存在）。
- [x] 路由权限矩阵：viewer 可读 / editor+ 可写卡牌 / owner 独占元数据更新、删除、协作者管理。
- [x] 协作者 CRUD：`GET/POST/PATCH/DELETE /api/boards/{id}/collaborators[/{user_id}]`，含 self-leave。
- [x] 活动日志新增 `collaborator_add` / `collaborator_role_change` / `collaborator_remove` 事件。
- [x] AI `/api/ai/chat` 切换至基于角色的访问校验（editor+ 才可写）。
- [x] `BoardSummary` 新增 `role` / `owner_*` / `is_shared` 字段；`GET /api/boards` 同时返回自有 + 共享看板。
- [x] 前端 `api.ts` 添加 `CollaboratorRole` / `BoardRole` 类型与四个 CRUD helpers。
- [x] `CollaboratorPanel` 抽屉组件（邀请、角色切换、移除、自助离开）。
- [x] `BoardList` 拆分 "Your boards" / "Shared with you" 两区，shared 卡片隐藏 owner-only 操作并显示角色徽章 + owner 名。
- [x] `KanbanBoard` 接入角色：viewer 关闭拖拽、隐藏新增/编辑/删除按钮、AI 入口、`CardDetailDialog` 切只读，header 显示 role 徽章 + "Shared by …"，新增 Members 按钮。
- [x] Pytest 新增 19 个测试（49→68 全通）：邀请校验、权限矩阵、AI 共享、自助离开、活动日志归因。
- [x] Vitest 新增 11 个测试（38→49 全通）：CollaboratorPanel CRUD + 错误处理、KanbanBoard viewer/editor 模式、BoardList shared 分组与 owner-only 控件隐藏。

## Part 15: Card comments & FK integrity (iteration 5)

### 已完成
- [x] `CardComment` 表（board_id FK CASCADE、card_id 字符串对应 JSON 卡片、body、created_at/updated_at）。
- [x] `backend/routes/comments.py`：GET/POST/PATCH/DELETE `/api/boards/{id}/cards/{card_id}/comments[/comment_id]`。
- [x] 权限矩阵：viewer 读 / editor+ 写 / 作者可编辑自己 / owner+作者可删；卡片不存在 404；非成员 404（隐藏存在）。
- [x] 活动日志新增 `comment_add`/`comment_edit`/`comment_delete` 事件。
- [x] SQLite `PRAGMA foreign_keys=ON`（主 engine + 测试 engine 均注册 connect listener），board 删除级联清理评论。
- [x] 修复：`create_board`/seed 后添加 `db.flush()` 确保 FK 约束满足（解决新建 + activity_log 同一事务内的顺序问题）。
- [x] 前端 `api.ts` 四个 helpers + `CardCommentEntry` 类型；`CardCommentsPanel` 组件（列表 / 发帖 / 编辑 / 删除，附错误处理、AuthError 传播）。
- [x] `CardDetailDialog` 挂载评论面板（按角色传 canComment/canModerate，readOnly 模式隐藏表单）。
- [x] Pytest 新增 12 个测试（80 共 68→80 全通）：CRUD、404、权限矩阵、级联、活动记录、鉴权。
- [x] Vitest 新增 8 个测试（57 共 49→57 全通）：渲染、发帖、编辑、owner 删除、空态、错误、鉴权、只读模式。

## Part 16: Board import/export + profile UI (iteration 6)

### 已完成
- [x] 后端 schemas `BoardExport` / `BoardExportComment` / `ImportBoardRequest`。
- [x] `GET /api/boards/{id}/export`：成员可下载完整 JSON（meta + data + comments）。
- [x] `POST /api/boards/import`：创建归登录用户所有的新看板；活动日志记录 `board_create` 并带 `meta.source = "import"`；过滤孤儿 / 空评论，作者归当前用户。
- [x] 路由顺序调整：`/import` 注册早于 `/{board_id}` 以避免动态段抢占。
- [x] 清理 `datetime.utcnow` 告警，统一用 `datetime.now(timezone.utc).replace(tzinfo=None)`。
- [x] 前端 `exportBoardApi` / `importBoardApi` + `BoardExportPayload` 类型。
- [x] `KanbanBoard` header 新增 "Export" 按钮（调用 `URL.createObjectURL` 下载 `.json`，文件名以看板名清洗）。
- [x] `BoardList` 工具栏新增隐藏 `<input type="file">` + "Import board" 按钮；用 `FileReader` 读取文本（兼容 jsdom，因 `File.text()` 未实现）。
- [x] `AuthContext.updateProfile` 接入 `PATCH /api/auth/me`。
- [x] `ProfileDialog` 组件：display_name / email / 密码修改（当前密码校验）、登出、未改动友好提示。
- [x] `page.tsx` 顶部用户名按钮/BoardList "Profile" 按钮均可打开 ProfileDialog。
- [x] Pytest 新增 7 个测试（80→87 全通）：export 成员 / 非成员 / 未登录；import 迁移数据 + 归属切换 + 活动记录 + 孤儿过滤 + 鉴权。
- [x] Vitest 新增 11 个测试（57→68 全通）：ProfileDialog 7 项（预填 / 密码校验 / 错误 / 未变化 / 登出 / 登录缺失），BoardList 3 项（Import 成功 / JSON 错误 / Profile 按钮），KanbanBoard 1 项（Export 调用 + Blob 下载）。

## Part 17: Mentions & notifications (iteration 7)

### 已完成
- [x] `Notification` 表（user_id FK CASCADE、board_id FK CASCADE、comment_id FK CASCADE、kind、actor_id、meta、read_at、created_at）。
- [x] `backend/mentions.py::parse_mentions()`：正则匹配 `@username`（3-32 字符），拒绝邮箱，去重并小写。
- [x] `create_comment` / `update_comment` 解析 mentions，交叉校验为看板成员（owner + collaborators），排除自己；为每位创建 `comment_mention` 通知；活动日志 `meta.mentions` 记录用户名。
- [x] 编辑评论时对比旧 body，已通知过的用户不重复发通知。
- [x] `GET /api/notifications?unread_only=&limit=` / `POST /{id}/read` / `POST /read-all`；跨用户访问返回 404 隐藏存在。
- [x] 前端 `listNotificationsApi` / `markNotificationReadApi` / `markAllNotificationsReadApi` + `NotificationEntry` 类型。
- [x] `NotificationsBell`：红色未读徽章（9+ 上限）、下拉列表、单条 / 全部已读、60 秒轮询刷新。
- [x] `page.tsx` 顶部栏挂载 bell；AuthError 统一 `onAuthLost` 清理会话。
- [x] `CardCommentsPanel::renderCommentBody`：内联渲染 `@chip`，不误伤邮箱、短句等。
- [x] Pytest 新增 8 个测试（87→95 全通）：成员提及 / 非成员忽略 / self-mention 抑制 / 编辑只通知新增 / 未读过滤 / 标记已读 / 归属校验 / 鉴权 / `parse_mentions` 纯函数单测。
- [x] Vitest 新增 11 个测试（68→79 全通）：bell 6 项（徽章、空态、单/全部已读、AuthError、描述函数）、mention 渲染 3 项（邮箱、短句、正常 chip）。

## Part 18: Collaborator invite notifications + keyboard shortcuts (iteration 8)

### 已完成
- [x] `add_collaborator` 在插入协作者的同时写入 `Notification(kind="collaborator_added")`，meta 带 board_name / role / 邀请人 username+display_name。
- [x] 修正现有 mention 用例以允许邀请通知共存（按 kind 过滤）。
- [x] Pytest 新增 1 项 + 调整 3 项（95→96 全通）：`test_invite_creates_collaborator_added_notification`。
- [x] `NotificationsBell::describeNotification` 新增 `collaborator_added` 文案（含 role）；vitest 新增 1 项（描述函数）。
- [x] `frontend/src/lib/shortcuts.ts`：可复用 `useShortcuts` hook，忽略 input/textarea/contentEditable 上的按键（Esc 除外），忽略修饰键组合。
- [x] `KanbanBoard` 挂载快捷键：`n` 点击 `[data-shortcut="add-card"]` 并将焦点移到首个 "Card title"；`/` 聚焦 `[data-shortcut="board-filter"]`；`?` 打开 `ShortcutsHelp` 对话框；`Esc` 按栈顺序关闭 Shortcuts → 卡片弹窗 → AI 侧栏 → 活动 → 成员。
- [x] Header 新增 "?" 按钮打开 cheat sheet；`BoardFilters` / `NewCardForm` 增加 `data-shortcut` 锚点。
- [x] Vitest 新增 3 项（80→83 全通）：`?`/Esc 打开关闭、`/` 聚焦搜索、`n` 展开新卡表单。

## Part 19: Cross-board dashboard (iteration 9)

### 已完成
- [x] `GET /api/dashboard?upcoming_limit=` 汇总当前用户可访问（owned + 共享，非归档）看板：summary / per-board aggregates / upcoming cards。
- [x] 逻辑：解析每板 JSON，分类 `overdue`（due_date < today）与 `due_soon_count`（today..+7d）；upcoming 跨板按 due_date 升序合并并裁剪。
- [x] 看板排序：owned 优先 / 按名字字母序。
- [x] Schemas：`DashboardSummary` / `DashboardBoard` / `DashboardCard` / `DashboardResponse`。
- [x] Pytest 新增 5 项（96→101 全通）：跨板聚合、共享板入选、归档排除、空态、鉴权。
- [x] 前端 `getDashboardApi` + 4 个类型；`DashboardView` 组件（统计网格、upcoming 列表、board 列表，空态与错误处理）。
- [x] `BoardList` 新增 "Dashboard" 按钮；`page.tsx` 挂载对话框。
- [x] Vitest 新增 7 项（83→90 全通）：渲染摘要、overdue 样式、空态、关闭按钮、AuthError 传播、通用错误、BoardList 按钮触发回调。

## Part 20: Activity log pagination + filter (iteration 10)

### 已完成
- [x] `GET /api/boards/{id}/activity` 新增 `kinds=a,b,c` 查询参数（逗号分隔）；空 / 未知 kind 返回空列表而非错误。
- [x] 兼容既有 `limit` / `before` 组合，实现游标式下拉分页。
- [x] 前端 `listBoardActivity` 添加 `kinds?: string[]` 选项。
- [x] `ActivityDrawer` 顶部新增类别下拉（All / Card / Comments / Board / Members）；筛选切换自动重载，底部 "Load more" 按钮以最老条目 `created_at` 为 `before` 游标追加。
- [x] 本地状态 `hasMore` 根据返回数量判断；loadingMore 独立态避免主列表闪烁。
- [x] Pytest 新增 1 项（101→102 全通）：多 kind 过滤 + 未知 kind 空结果。
- [x] Vitest 新增 2 项（90→92 全通）：kind 过滤 API 参数、Load more 调用携带 before 游标。

## 总结（session 迭代汇总）

本次 Ralph Loop 会话完成了 **8 轮增强**（Parts 13-20），项目从 Part 12（卡片元数据与筛选）推进至 Part 20（活动日志分页与过滤），测试总数由 31 + 29 = 60 增至 102 + 92 = **194**，涵盖单测、集成、mock、鉴权与 UI 行为。

新增主要能力：
- 活动日志（记录、过滤、分页）与配套 UI；
- 用户资料自助维护（`PATCH /me` + ProfileDialog）；
- 多人协作（BoardCollaborator、角色矩阵、共享板分组）；
- 卡片评论 + SQLite 级联 + 活动关联；
- 看板导入 / 导出（JSON，带评论）；
- 评论 @mention 与站内通知（bell + 深链 meta）；
- 协作者邀请通知；
- 键盘快捷键 + 帮助对话框；
- 跨看板 Dashboard 聚合（overdue / due-soon / upcoming）；
- 活动日志分页与多 kind 过滤。

## 后续规划（下一轮可选）
- WebSocket 实时推送（活动 + 通知）。
- 导入冲突处理（id 重映射策略）。
- 评论 @mention 自动补全（用户搜索 API）。
- Dashboard：按优先级分布堆叠图；点击 upcoming 直接跳转卡片。
- Notifications 深链：点击通知跳转到对应板 + 卡片。
- Shortcuts 扩展：`g then b` 返回看板列表、方向键选择卡片等。
