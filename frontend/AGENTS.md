# Frontend AGENTS documentation

## 项目结构

- `app/`: Next.js 应用入口
  - `layout.tsx`: 全局布局
  - `page.tsx`: 首页入口（渲染 `KanbanBoard`）
- `components/`:
  - `KanbanBoard.tsx`: 主看板组件，包含拖拽、列重命名、新卡片、删除卡片逻辑。
  - `KanbanColumn.tsx`: 单列组件，显示列标题、卡片列表、添加卡片表单。
  - `KanbanCard.tsx`: 单卡片组件，显示卡片内容和删除按钮。
  - `KanbanCardPreview.tsx`: 拖拽时预览卡片。
  - `NewCardForm.tsx`: 新卡片输入表单（标题 + 详情）。
- `lib/kanban.ts`:
  - 定义数据结构 `BoardData`, `Column`, `Card`。
  - `initialData`: 5 列初始样例内容。
  - `createId`: 生成卡片/列 ID。
  - `moveCard`: 列间拖拽卡片位置计算函数。
- 测试
  - `components/KanbanBoard.test.tsx`：组件交互测试。
  - `lib/kanban.test.ts`：业务函数测试。

## UI 流程（当前实现）

1. 页面加载：`KanbanBoard` 初始化 `board` 为 `initialData`。
2. 拖拽：使用 `@dnd-kit`，`onDragStart` 记录 active card，`onDragEnd` 调用 `moveCard`。
3. 重命名列：`handleRenameColumn` 更新列 title。
4. 添加卡片：`handleAddCard` 追加新卡片到 `cards` + `columns`。
5. 删除卡片：`handleDeleteCard` 从 `cards` 和列 `cardIds` 清理。

## 当前差距（下一步改进点）

- 尚未集成后端 API，`board` 数据只存在内存状态。
- 尚无登录保护。
- 尚未实现 AI 聊天侧边栏。

## 测试覆盖率目标

- 目标：`frontend` 单元测试覆盖率 >= 80%。
- 建议新增 `Vitest` 结合 `@testing-library/react` 的组件行为测试和 `Playwright` 集成测试。
