# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanban Studio - a multi-user project management application with Next.js frontend, Python FastAPI backend, and SQLite database, all packaged in Docker. Features: self-serve user registration, bearer-token sessions, per-user multiple Kanban boards, drag-and-drop via @dnd-kit, AI chat assistant via OpenRouter.

## Build & Run Commands

```bash
# Docker (primary way to run)
docker compose up -d --build        # Build and start (serves at http://localhost:8000)
docker compose down                 # Stop
scripts/start.sh                    # Shortcut for above (start.ps1 on Windows)
scripts/stop.sh                     # Shortcut for above (stop.ps1 on Windows)

# Frontend (from frontend/)
npm run dev                         # Next.js dev server
npm run build                       # Static export build
npm run lint                        # ESLint
npm run test                        # Vitest unit tests (single run)
npm run test:unit:watch             # Vitest watch mode
npm run test:e2e                    # Playwright E2E tests (requires Docker running)
npm run test:auth                   # Auth E2E tests only

# Backend tests (from project root; .venv recommended via uv)
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r backend/requirements.txt
.venv/bin/python -m pytest backend/test_api.py
```

## Architecture

**Frontend** (Next.js 16, React 19, TypeScript, Tailwind CSS v4):
- Static export (`output: "export"` in next.config.ts) served by FastAPI
- `src/lib/kanban.ts` — BoardData/Column/Card types and moveCard logic
- `src/lib/api.ts` — typed HTTP client; throws `AuthError` on 401, `ApiError` otherwise
- `src/lib/auth.tsx` — AuthProvider with bearer-token persistence (localStorage), login/register/logout
- `src/components/LoginForm.tsx` — login + registration (mode toggle)
- `src/components/BoardList.tsx` — per-user board grid (create/rename/archive/delete)
- `src/components/KanbanBoard.tsx` — board detail view with debounced saves + filter bar + card detail dialog
- `src/components/CardDetailDialog.tsx` — edit title/details/labels/priority/due date (state resets via `key=card.id`)
- `src/components/BoardFilters.tsx` — client-side filtering (search, priority, labels, due-only). `applyFilters` is pure and unit-tested.
- `src/components/AiChatSidebar.tsx` — AI chat panel (posts board_id to backend)
- `src/app/page.tsx` — orchestrates login → board list → board detail flow

**Backend** (FastAPI, SQLAlchemy, SQLite at `backend/data/kanban.db`):
- `backend/main.py` — FastAPI app + serves static frontend from `frontend/out`
- `backend/models.py` — User, Board, Session tables; `KANBAN_DATABASE_URL` env overrides DB path
- `backend/auth.py` — bcrypt via passlib (+ SHA256 legacy fallback), session tokens via `secrets.token_urlsafe`
- `backend/schemas.py` — Pydantic models for auth, boards, AI
- `backend/routes/auth.py` — POST `/api/auth/register`, `/login`, `/logout`; GET `/api/auth/me`
- `backend/routes/boards.py` — GET/POST `/api/boards`; GET/PUT/PATCH/DELETE `/api/boards/{id}`
- `backend/routes/ai.py` — POST `/api/ai/chat` (takes `board_id`), `/api/ai/test`

**Auth**: `Authorization: Bearer <token>` header. Tokens stored server-side in `sessions` table; logout deletes the row. Default demo user (`user`/`password`) is seeded on startup for convenience.

**Docker**: Multi-stage build — Node builds frontend static files, Python serves everything on port 8000.

## Testing

- **Frontend unit**: Vitest + @testing-library/react, jsdom. Tests in `src/**/*.test.{ts,tsx}`. Current coverage includes KanbanBoard, BoardList, LoginForm, kanban lib.
- **E2E**: Playwright (Chromium), tests in `tests/` at project root. Specs: `auth.spec.ts`, `boards.spec.ts`. Base URL `http://localhost:8000`; auto-starts Docker.
- **Backend**: pytest with httpx TestClient. Uses a temp SQLite file (set via `KANBAN_DATABASE_URL` before `backend` imports). Each test resets tables via fixture.

## Coding Standards

- Use latest library versions and idiomatic approaches
- Keep it simple — no over-engineering, no unnecessary defensive programming, no extra features
- Be concise. No emojis ever
- When hitting issues, identify root cause with evidence before attempting fixes
- Use "uv" as the Python package manager in Docker
- AI model: `openai/gpt-oss-120b` via OpenRouter (API key in `.env`)

## Project Status

Multi-user + multi-board foundation complete (bcrypt, bearer sessions, board CRUD, registration UI). Further planned work: card labels/due-dates, board sharing/collaboration, activity log. See `docs/PLAN.md`.
