# Kanban Studio 代码审查

审查日期：2026-04-18
审查范围：`backend/`（FastAPI + SQLAlchemy）、`frontend/`（Next.js 16 + React 19）、Docker 构建、测试套件
审查方式：静态阅读全部源码，未运行时动态分析

---

## 1. 总体评价

项目作为 MVP 整体结构清晰：FastAPI 使用 `APIRouter` 按模块拆分（`auth/boards/ai/health`），前端组件单一职责划分良好，拖拽逻辑 (`moveCard`) 纯函数化并配有单元测试。Docker 多阶段构建简洁。

但存在若干**必须在生产之前修复**的安全问题，以及数处影响正确性、可靠性的 bug。CLAUDE.md 中"Parts 7-10 未实现"的状态描述与代码不符（auth / 前后端集成 / AI 聊天实际已存在），建议同步更新。

---

## 2. 严重问题（Blocker）

### 2.1 OPENROUTER_API_KEY 真实密钥泄漏风险

- **位置**：`.env`、`Dockerfile:25`
- **问题**：仓库根目录 `.env` 中包含真实的 OpenRouter API Key（`sk-or-v1-d3aa...`）。虽然 `.gitignore` 正确忽略了 `.env`，但 `Dockerfile` 中 `COPY .env ./.env` 会把该密钥**烘焙进镜像层**。任何拿到构建镜像的人都能通过 `docker history` 或解包镜像层读到明文密钥。
- **建议**：
  1. 立即到 OpenRouter 控制台吊销并重新生成该 Key（泄漏时间已不可逆）。
  2. 移除 Dockerfile 中的 `COPY .env`，改为运行时通过 `docker compose` 的 `env_file`（已配置）注入环境变量。
  3. 仓库中提供 `.env.example`，只列变量名、不含值。

### 2.2 浏览器凭据以明文方式持久化

- **位置**：`frontend/src/lib/auth.tsx:44-45`
- **问题**：登录成功后把 `btoa("user:password")` 写入 `localStorage`，每次请求从内存变量 `_authCreds` 取出放到 `Authorization: Basic ...`。Base64 并非加密，一旦发生任意 XSS，攻击者可以直接拿到**明文用户名和密码**（不仅是会话令牌）。
- **建议**：即使是 MVP，也应切换为服务端签发的会话令牌（FastAPI 可用 `itsdangerous` 或 JWT），token 存 `localStorage` 或 `httpOnly` Cookie，过期可旋转；不要把可逆的密码凭据留在客户端。

### 2.3 密码哈希使用无盐 SHA256

- **位置**：`backend/auth.py:14-15`
- **问题**：`hashlib.sha256(password.encode()).hexdigest()` 对彩虹表、GPU 暴破、离线字典攻击几乎不设防。代码注释"MVP - use bcrypt in production"已自知，但即使 MVP 阶段也不建议使用。
- **建议**：改用 `passlib[bcrypt]` 或 `argon2-cffi`。依赖已具备，迁移成本低。

### 2.4 登录接口无速率限制

- **位置**：`backend/routes/auth.py:11`
- **问题**：`/api/auth/login` 没有限速、没有失败计数、没有 IP 封禁，可以被无限撞库。结合 2.3 的弱哈希，风险倍增。
- **建议**：引入 `slowapi`（Redis/内存后端）对 `/api/auth/login` 限流，例如同一 IP 5 次/分钟。

---

## 3. 正确性 Bug（Major）

### 3.1 前端首屏 Loading 永久卡住

- **位置**：`frontend/src/components/KanbanBoard.tsx:28-33`
```ts
useEffect(() => {
  getBoard(userId).then((data) => {
    setBoard(data);
    setLoading(false);
  });
}, [userId]);
```
- **问题**：缺少 `.catch`。当后端返回 5xx、网络断开、session 过期等情况，`setLoading(false)` 永不执行，用户界面永远停在 "Loading board..."，且没有任何错误提示。
- **建议**：
```ts
getBoard(userId)
  .then(setBoard)
  .catch((err) => setError(err.message))
  .finally(() => setLoading(false));
```

### 3.2 AI 应用动作未经校验即写入数据库

- **位置**：`backend/routes/ai.py:66-79`、`backend/ai.py:33-102`
- **问题**：`apply_actions` 根据模型返回的 actions 直接改写 `kanban` 字典，再 `json.dumps` 存库。**不经过 `BoardDataModel` 校验**，与 `PUT /api/boards/{user_id}` 的强制校验路径不一致。一旦模型返回异常字段（例如 `title` 为 `None`、`cardIds` 里多出不存在的 id），脏数据就直接持久化。
- **建议**：在持久化前用 `BoardDataModel.model_validate(board_update)` 做一次校验，失败则丢弃并回写原始数据。

### 3.3 AI 聊天存在覆盖写的竞态

- **位置**：`backend/routes/ai.py:44-79`
- **问题**：客户端把当前 `board` 作为 `kanban` 字段传入 → 服务端在此基础上应用 actions → 写库。如果在请求往返期间用户用拖拽或其它客户端改动了同一 board（前端本地的 `updateBoard` 防抖保存），AI 的写入会**直接覆盖**中间的改动，且前端的 `handleAiBoardUpdate` 也会替换本地状态。
- **建议**：引入简单的乐观锁——`Board` 表加 `version` 字段，PUT/AI 写入都对比版本号。即使不做乐观锁，也应该服务端每次读最新 board 再合并 actions，而不是信任客户端传来的 kanban 快照。

### 3.4 `apply_actions` 对入参做浅复制后原地修改

- **位置**：`backend/routes/ai.py:66`、`backend/ai.py:43-102`
- **问题**：`apply_actions(actions, dict(req.kanban))` 只做了外层 `dict` 的浅拷贝，内部的 `columns` 列表、`cards` 字典是**同一引用**。`apply_actions` 中 `col["cardIds"].append(...)` / `cards.pop(...)` 等操作都是原地变更，影响的是调用方的同一对象。目前因 `req.kanban` 后续不再使用，还没暴露问题，但这是一个计时炸弹。
- **建议**：`import copy; kanban = copy.deepcopy(req.kanban)` 或者在 `apply_actions` 里显式深拷贝。

### 3.5 Frontend 组件取卡片可能为 `undefined`

- **位置**：`frontend/src/components/KanbanBoard.tsx:205`
```ts
cards={column.cardIds.map((cardId) => board.cards[cardId])}
```
- **问题**：如果 `cardIds` 与 `cards` map 发生漂移（例如 AI 或并发保存导致脏数据，见 3.2/3.3），`board.cards[cardId]` 为 `undefined`，下游 `KanbanCard` 访问 `card.id / card.title` 直接抛 `TypeError` 并导致整个 React 树崩溃（当前没有 Error Boundary）。
- **建议**：在 `map` 中过滤掉 `undefined`，或在服务端持久化前保证一致性（见 3.2 建议）。

---

## 4. 安全加固（Minor ~ Major）

1. **CSRF 防护**：当前基于 Basic Auth + localStorage 的方案对 CSRF 天然免疫，但若切换为 Cookie 方案需同步引入 CSRF token。
2. **CORS**：`main.py` 未显式配置 CORS。同源部署没问题；一旦前端独立域名，就要加 `CORSMiddleware`。
3. **请求体大小限制**：`BoardDataModel` 仅限 20 列，对 `cards` dict 和单卡片内容都无上限。恶意用户可以传 10 MB 的 JSON 让 SQLite TEXT 字段膨胀，应加 `max_length`。
4. **`ChatRequest.kanban: dict` 缺校验**：任意 JSON 进入 `json.dumps` 再拼进 Prompt，存在 prompt injection / 异常字段攻击面。建议直接复用 `BoardDataModel`。
5. **默认用户"user/password"**：`seed_default_user` 无视环境变量硬编码。生产禁用，或至少从 `.env` 读取。

---

## 5. 代码质量与可维护性

### 5.1 类型标注错误

- `backend/models.py:17,18,30,31`：`created_at: Mapped[str]` 但列类型为 `DateTime`，实际运行时得到的是 `datetime.datetime`。请改为 `Mapped[datetime]`。

### 5.2 Dockerfile

- 第 2 行 `FROM node:20-alpine as frontend-build`：`as` 需改成大写 `AS`（新版 Docker 会警告）。
- `pip install` 与 CLAUDE.md 规则"use uv as Python package manager in Docker"冲突。
- 无 `HEALTHCHECK`，`docker-compose.yml` 也没有 healthcheck。

### 5.3 依赖版本策略

- `backend/requirements.txt` 全部用 `>=` 无上界，构建不可复现。建议锁定到兼容版本并生成 lock 文件（`uv pip compile` 或 `pip-tools`）。

### 5.4 AI 配置硬编码

- `backend/ai.py:16`：`MODEL = "openai/gpt-oss-120b"` 应从环境变量读取，方便切换。
- `timeout=30.0` 无重试逻辑，OpenRouter 偶发 502 会直接失败返回给前端。

### 5.5 前端 `createId`

- `frontend/src/lib/kanban.ts:164`：`Math.random()` 非加密强度，并且生成 ID 时没有做冲突校验。概率低但不为零。`crypto.randomUUID()` 在所有目标浏览器都已可用。

### 5.6 `saveVersion` 机制冗余

- `KanbanBoard.tsx:25-44`：先 `clearTimeout` 再用 `saveVersion` 作二次闸门是过度防御。JS 单线程情况下，`clearTimeout` 已足以阻止后续回调。保留一套即可。

### 5.7 CLAUDE.md 状态描述过时

- CLAUDE.md 写"Parts 7-10 未实现"，但 `routes/ai.py`、`AiChatSidebar.tsx`、`api.ts` 已把前后端集成与 AI 聊天写好。建议更新，否则误导协作者。

---

## 6. 测试覆盖

### 已做好的部分

- `moveCard` 有纯函数单测。
- 后端 `auth / boards / ai` 接口均有 pytest 覆盖鉴权、forbidden、成功路径。
- Playwright E2E 覆盖登录、拖拽、新增卡片。

### 缺口

1. **AI 动作分支**：`test_api.py` 只测了 `add_card` 和非法 column，缺 `move_card / edit_card / delete_card` 的端到端测试；`apply_actions` 也没有独立单元测试（其分支、异常分支都未覆盖）。
2. **前端错误路径**：`getBoard` 失败、`updateBoard` 失败时的 UI 表现无测试（正是 3.1 的盲区）。
3. **AI sidebar 交互**：`AiChatSidebar` 的发送/错误/`board_update` 分支没有组件测试。
4. **测试数据清理**：`test_kanban.db` 与主 `kanban.db` 同目录，使用 function-scope fixture `drop_all` 但文件不清理；多轮运行可能残留。
5. **`dependency_overrides` 全局副作用**：`test_api.py:23` 在模块导入时就改写 `app.dependency_overrides`，若与其它 test module 同进程运行可能互相污染。推荐放进 fixture。
6. **E2E 数据污染**：Playwright 使用现有 Docker 实例（`reuseExistingServer: true`），同一个 `kanban.db` 会积累前一次运行的新增卡片。`kanban.spec.ts` 里的 `card-card-1` 依赖默认种子数据存在，不保证幂等。

---

## 7. 小问题 / Nits

- `backend/main.py:28` 构造 `frontend_out_dir` 使用字符串拼接 `".."`，应改为 `pathlib.Path(__file__).parent.parent / "frontend" / "out"`，更健壮。
- `backend/main.py:30-31` 把 `/` 挂 StaticFiles 后，所有未命中的前端路径会回落到 html；OK，但 `/api/xxx` 拼写错误时返回 200 + HTML 可能让前端调试误判为成功。可在挂载前显式注册 `/api/*` 404 处理。
- `backend/auth.py:18-29`：验证时未使用恒定时间比较（`hmac.compare_digest`），理论上存在哈希比对时的定时侧信道。
- `frontend/src/components/LoginForm.tsx:16`：错误仅展示 "Invalid credentials"，对 500 / 网络错误同样给出此提示，用户/运维无从排障。
- `frontend/src/components/KanbanCard.tsx`：删除按钮无二次确认；与 AGENTS.md 的 "keep it simple" 一致，不强求改。
- `backend/routes/health.py:11-13` 的 `/hello` 端点是死代码，可移除。
- `docs/codereview.md` 与本次 `docs/review.md` 内容有重叠，建议归档或合并。

---

## 8. 优先修复顺序建议

| 优先级 | 问题                                       | 成本 |
|--------|--------------------------------------------|------|
| P0     | 2.1 吊销并移除 `.env` 中的 API Key          | 0.5h |
| P0     | 2.2 / 2.3 切换为会话令牌 + bcrypt           | 3h   |
| P1     | 3.1 前端 Loading 卡死修复                   | 0.2h |
| P1     | 3.2 AI 写入前做 BoardDataModel 校验         | 0.5h |
| P1     | 3.3 AI/PUT 增加乐观锁版本号                 | 2h   |
| P2     | 5.1 修正 `Mapped[str]` 类型标注             | 0.2h |
| P2     | 2.4 登录速率限制                            | 1h   |
| P2     | 6.1 / 6.2 补齐 AI 动作与前端错误路径测试    | 2h   |
| P3     | 其余 Nits / CLAUDE.md 更新                  | 1h   |

---

## 9. 值得肯定的点

- 路由按模块切分，`APIRouter.prefix` 使用得当。
- `moveCard` 保持纯函数、已通过单测覆盖，是项目的典范模块。
- Pydantic schema 与路由耦合合理，`BoardDataModel` 已做了 `max_columns` 基础校验。
- 前端组件切分合理，拖拽预览 `KanbanCardPreview` 独立出来是正确的取舍。
- Playwright + Vitest 双层测试框架搭得漂亮。

希望以上建议对下一轮迭代有所帮助。
