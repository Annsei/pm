# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kanban Studio - a Project Management MVP with Next.js frontend, Python FastAPI backend, and SQLite database, all packaged in Docker. Features: hardcoded single-user auth (user/password), drag-and-drop Kanban board via @dnd-kit, planned AI chat sidebar via OpenRouter.

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

# Frontend tests (from frontend/)
npm run test                        # Vitest unit tests (single run)
npm run test:unit:watch             # Vitest watch mode
npm run test:e2e                    # Playwright E2E tests (requires Docker running)
npm run test:auth                   # Auth E2E tests only

# Backend tests
pytest backend/test_api.py          # From project root
```

## Architecture

**Frontend** (Next.js 16, React 19, TypeScript, Tailwind CSS v4):
- Static export (`output: "export"` in next.config.ts) served by FastAPI
- `src/lib/kanban.ts` — BoardData/Column/Card types and moveCard logic
- `src/lib/auth.tsx` — AuthProvider context with localStorage persistence
- `src/components/KanbanBoard.tsx` — main board with drag-drop, CRUD operations
- Currently frontend-only state; backend integration not yet wired

**Backend** (FastAPI, SQLAlchemy, SQLite at `backend/data/kanban.db`):
- `backend/main.py` — API routes + serves static frontend from `frontend/out`
- `backend/models.py` — User and Board tables; board data stored as JSON string
- Auth: HTTP Basic with SHA256 hashing (MVP only)
- Endpoints: `POST /api/auth/login`, `GET/PUT /api/boards/{user_id}`

**Docker**: Multi-stage build — Node builds frontend static files, Python serves everything on port 8000.

## Testing

- **Frontend unit**: Vitest + @testing-library/react, jsdom environment. Tests in `src/**/*.test.{ts,tsx}`
- **E2E**: Playwright (Chromium only), tests in `tests/` at project root. Base URL http://localhost:8000; auto-starts Docker
- **Backend**: pytest with httpx TestClient, uses separate `test_kanban.db`

## Coding Standards

- Use latest library versions and idiomatic approaches
- Keep it simple — no over-engineering, no unnecessary defensive programming, no extra features
- Be concise. No emojis ever
- When hitting issues, identify root cause with evidence before attempting fixes
- Use "uv" as the Python package manager in Docker
- AI model: `openai/gpt-oss-120b` via OpenRouter (API key in `.env`)

## Project Status

Parts 1-6 complete (plan, Docker, frontend UI, auth, DB schema, backend API). Frontend-backend integration (Part 7), AI connectivity (Parts 8-10) not yet implemented. See `docs/PLAN.md` for full roadmap.
