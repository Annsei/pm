# Code Review Report - Kanban Studio

Date: 2026-04-14

## Summary

Full codebase review covering backend, frontend, tests, configuration, and Docker setup. 30 issues found across security, bugs, code quality, testing, and configuration.

| Category      | Critical | High | Medium | Low | Total |
|---------------|----------|------|--------|-----|-------|
| Security      | 1        | 2    | 1      | 1   | 5     |
| Bugs          | 1        | 2    | 3      | 1   | 7     |
| Code Quality  | 0        | 1    | 1      | 4   | 6     |
| Testing       | 0        | 0    | 3      | 0   | 3     |
| Architecture  | 0        | 1    | 1      | 1   | 3     |
| Configuration | 0        | 0    | 2      | 0   | 2     |
| UX            | 0        | 0    | 0      | 1   | 1     |
| Performance   | 0        | 0    | 0      | 1   | 1     |
| **Total**     | **2**    | **6**| **11** | **9** | **28** |

---

## Critical Issues

### ~~C1. Exposed API Key in Repository~~ NOT AN ISSUE
- `.env` is already in `.gitignore` and is not tracked by git. No action needed.

### C2. No Input Validation on Board Update Endpoint
- **File**: `backend/main.py:114-130`
- **Category**: Security / Bug
- **Description**: `PUT /api/boards/{user_id}` accepts an arbitrary `dict` without validating structure. Malformed JSON can corrupt board data and crash the frontend.
- **Action**: Use a Pydantic model to validate the board structure (columns array with id/title/cardIds, cards dict with id/title/details).

### C3. Race Condition in Debounced Save vs AI Update
- **File**: `frontend/src/components/KanbanBoard.tsx:34-42, 121-127`
- **Category**: Bug
- **Description**: If a user makes a manual edit (triggering a 500ms debounced save) and then AI returns a board update, the `handleAiBoardUpdate` clears the timer. But if the user edits again quickly after AI update, the debounce may fire with stale board data from before the AI update, overwriting the AI changes in the DB.
- **Action**: Add a version counter or timestamp to ensure saves never overwrite newer data.

---

## High Severity Issues

### H1. Board Endpoints Have No Authentication
- **File**: `backend/main.py:98-130`
- **Category**: Security
- **Description**: `GET /api/boards/{user_id}` and `PUT /api/boards/{user_id}` are completely unprotected. Anyone who knows a user_id can read or overwrite their board without authentication.
- **Action**: Add `authenticate_user` dependency to these endpoints and verify `user_id` matches the authenticated user.

### H2. AI Chat Endpoint Has No Authentication
- **File**: `backend/main.py:191`
- **Category**: Security
- **Description**: `POST /api/ai/chat` accepts any `user_id` without authentication. An attacker can make AI calls and modify any user's board.
- **Action**: Protect the endpoint with authentication.

### H3. Insecure Password Hashing (SHA256, No Salt)
- **File**: `backend/main.py:82-84`
- **Category**: Security
- **Description**: Passwords are hashed with plain SHA256 without salt. Vulnerable to rainbow tables and brute force.
- **Action**: Acceptable for MVP per project scope ("Non-goal: security hardening beyond MVP"), but document the limitation. For production: use bcrypt via `passlib`.

### H4. Frontend Stores Only userId, No Auth Token
- **File**: `frontend/src/lib/auth.tsx:40`
- **Category**: Architecture
- **Description**: After login, only `userId` is stored in localStorage. There is no token or session to prove the user is authenticated. All subsequent API calls are unauthenticated.
- **Action**: Implement token-based auth (JWT or session cookie) returned from the login endpoint and sent with subsequent API requests.

### H5. Frontend-Backend Board Data Mismatch
- **File**: `backend/models.py:59-66` vs `frontend/src/lib/kanban.ts:18-31`
- **Category**: Architecture
- **Description**: Backend DEFAULT_BOARD_DATA uses column IDs `column-1` through `column-5` with titles "To Do", "In Progress", etc. Frontend initialData uses IDs `col-backlog`, `col-discovery`, etc. with different titles. If frontend falls back to initialData, it will be inconsistent with backend data.
- **Action**: Remove frontend's initialData fallback (it's no longer used since Part 7 loads from backend). Or unify the naming.

### H6. Error Handling in API Calls Is Misleading
- **File**: `frontend/src/lib/api.ts`
- **Category**: Code Quality
- **Description**: `loginApi` throws "Invalid credentials" for any non-OK response, including 500 server errors. `getBoard` and `updateBoard` throw generic messages that don't distinguish between network errors, 4xx, and 5xx.
- **Action**: Distinguish between 401 (bad credentials), 5xx (server error), and network failures.

---

## Medium Severity Issues

### M1. AI Response JSON Parsing Without Field Validation
- **File**: `backend/main.py:194-199`
- **Category**: Bug
- **Description**: After parsing the AI JSON response, the code accesses `parsed.get("actions", [])` but doesn't validate that `actions` is actually a list or that each action has the required fields. If the model returns `"actions": "some string"`, the for loop will iterate over characters.
- **Action**: Validate `isinstance(actions, list)` and validate each action dict has required fields before processing.

### M2. AI Action Handler Doesn't Validate Referenced IDs
- **File**: `backend/main.py:210-258`
- **Category**: Bug
- **Description**: `move_card` and `edit_card` actions don't check if the referenced card_id or column_id exists. Moving a non-existent card silently does nothing, which is confusing.
- **Action**: Skip invalid actions and optionally include a warning in the response_text.

### M3. No Timeout on AI API Calls
- **File**: `backend/main.py:189-195`
- **Category**: Bug
- **Description**: The OpenAI client call has no timeout. If OpenRouter hangs, the request blocks indefinitely, tying up a server thread and leaving the user waiting.
- **Action**: Set `timeout=30` on the OpenAI client or the specific call.

### M4. Backend Tests Don't Cover AI Endpoints
- **File**: `backend/test_api.py`
- **Category**: Testing
- **Description**: No tests for `POST /api/ai/test` or `POST /api/ai/chat`. These are critical paths with complex logic (action application, DB writes).
- **Action**: Add tests with mocked AI responses covering: add_card, move_card, edit_card, delete_card actions, invalid JSON response, empty actions.

### M5. Backend Tests Import From Wrong Module Path
- **File**: `backend/test_api.py:8`
- **Category**: Testing
- **Description**: `from main import app` and `from models import Base, get_db` use bare module names, but the app uses `from backend.models import ...`. Tests work only when run from inside `backend/` directory but fail from project root.
- **Action**: Use consistent import paths or configure pytest to add backend to sys.path.

### M6. E2E Auth Tests Are Stale
- **File**: `tests/auth.spec.ts`
- **Category**: Testing
- **Description**: Auth tests were written for the old frontend-only auth (hardcoded check in LoginForm). Now that login calls the backend API, these tests need the Docker backend running and may have different timing/behavior.
- **Action**: Verify auth.spec.ts still passes with the new backend-integrated login flow. Update if needed.

### M7. Dockerfile Installs build-essential Unnecessarily
- **File**: `Dockerfile:22`
- **Category**: Configuration
- **Description**: `build-essential` (323MB) is installed in the runtime image but no Python dependency requires C compilation. This bloats the image.
- **Action**: Remove `build-essential` installation. If a future dependency needs it, use a multi-stage pip install.

### M8. Playwright Config Hardcodes Localhost
- **File**: `frontend/playwright.config.ts`
- **Category**: Configuration
- **Description**: `baseURL` is hardcoded to `http://localhost:8000`. The webServer command uses `docker compose up -d --build` which may conflict with an already-running container.
- **Action**: Use `process.env.BASE_URL || "http://localhost:8000"` for flexibility.

### M9. Drag-Drop Save Triggers Even on No-Op
- **File**: `frontend/src/components/KanbanBoard.tsx:66-79`
- **Category**: Bug
- **Description**: If `moveCard` returns unchanged columns (e.g., dragging a card back to its original position), the `update()` function still calls `save()`, making an unnecessary PUT request.
- **Action**: Compare columns before and after; skip save if unchanged.

### M10. Deprecated SQLAlchemy API Usage
- **File**: `backend/models.py:8`
- **Category**: Code Quality
- **Description**: `from sqlalchemy.ext.declarative import declarative_base` is deprecated in SQLAlchemy 2.x. Should use `from sqlalchemy.orm import DeclarativeBase`.
- **Action**: Update to modern SQLAlchemy 2.x pattern.

### M11. Deprecated FastAPI Startup Event
- **File**: `backend/main.py:44`
- **Category**: Code Quality
- **Description**: `@app.on_event("startup")` is deprecated in newer FastAPI. Should use lifespan context manager.
- **Action**: Migrate to `@asynccontextmanager` lifespan pattern when upgrading FastAPI.

---

## Low Severity Issues

### L1. No Backend Logging
- **File**: `backend/main.py`
- **Category**: Code Quality
- **Description**: No structured logging for login attempts, board updates, AI calls, or errors. Uvicorn logs HTTP requests but application-level events are invisible.
- **Action**: Add `logging` module with appropriate log levels.

### L2. No CORS Configuration
- **File**: `backend/main.py`
- **Category**: Architecture
- **Description**: No CORS middleware configured. Currently not needed (same-origin serving), but will block requests if frontend/backend are ever deployed separately.
- **Action**: Add CORSMiddleware when deployment architecture changes.

### L3. No Database Indexes
- **File**: `backend/models.py`
- **Category**: Performance
- **Description**: No explicit indexes on `Board.user_id`. Queries filter by `user_id` on every board access.
- **Action**: Add `index=True` to `Board.user_id` column. (The `unique=True` on `User.username` already implies an index.)

### L4. Inconsistent Error Messages Across API Functions
- **File**: `frontend/src/lib/api.ts`
- **Category**: Code Quality
- **Description**: Error messages are inconsistent: "Invalid credentials", "Failed to load board", "Failed to save board", "AI request failed". No standard format.
- **Action**: Standardize error handling pattern.

### L5. No Loading Timeout for Board Fetch
- **File**: `frontend/src/components/KanbanBoard.tsx:25-30`
- **Category**: UX
- **Description**: If `getBoard` hangs (network issue), the user sees "Loading board..." forever with no way to retry.
- **Action**: Add a timeout and a retry button on failure.

### L6. CSS Variables Are All Defined (No Issue)
- **File**: `frontend/src/app/globals.css`
- **Category**: Code Quality
- **Description**: All CSS variables used in components are properly defined in `:root`. However, `--font-body` and `--font-display` referenced in `body` and `.font-display` rules are not defined in globals.css (they come from Next.js font module).
- **Action**: Add fallback values in the CSS for when fonts fail to load.

### L7. docker-compose.yml Missing .gitignore for Data Volume
- **File**: `docker-compose.yml`
- **Category**: Configuration
- **Description**: The SQLite database file `backend/data/kanban.db` is created inside the container but not persisted via a volume mount. Data is lost when the container is recreated.
- **Action**: Add a volume mount: `volumes: ["./backend/data:/app/backend/data"]`

### L8. Scripts Lack Error Handling
- **File**: `scripts/start.sh`, `scripts/stop.sh`
- **Category**: Code Quality
- **Description**: Scripts don't check if Docker/Docker Compose is installed or running before executing commands.
- **Action**: Add basic checks (`command -v docker` / `docker info`).

### L9. Test Setup File Is Minimal
- **File**: `frontend/src/test/setup.ts`
- **Category**: Testing
- **Description**: The test setup file exists but may not configure all necessary globals for testing (e.g., localStorage mock, fetch mock).
- **Action**: Verify setup.ts properly configures the test environment.

### ~~L10. No .gitignore Entry for .env~~ NOT AN ISSUE
- `.env` is already in `.gitignore`. No action needed.

---

## Recommended Priority Actions

### Immediate (before any deployment)
1. **H1/H2**: Add authentication to board and AI endpoints
2. **C2**: Validate board data structure on PUT endpoint

### Short-term (next sprint)
4. **C3**: Fix race condition between debounced save and AI updates
5. **M1/M2**: Validate AI response structure and action IDs
6. **M3**: Add timeout to AI API calls
7. **M4**: Add backend tests for AI endpoints
8. **L7**: Add Docker volume mount for SQLite persistence

### Medium-term (technical debt)
10. **H4**: Implement token-based authentication
11. **M7**: Remove unnecessary `build-essential` from Dockerfile
12. **M10/M11**: Update deprecated SQLAlchemy and FastAPI APIs
13. **L1**: Add structured logging
14. **L3**: Add database indexes
