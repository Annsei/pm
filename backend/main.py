import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.auth import seed_default_user
from backend.models import create_tables
from backend.routes import health, auth, boards, ai, comments, notifications, dashboard


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    seed_default_user()
    yield


app = FastAPI(lifespan=lifespan)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(boards.router)
app.include_router(comments.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)
app.include_router(ai.router)

# Serve built frontend static export if present
frontend_out_dir = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")

if os.path.isdir(frontend_out_dir):
    app.mount("/", StaticFiles(directory=frontend_out_dir, html=True), name="frontend")
else:

    @app.get("/", response_class=HTMLResponse)
    def root():
        return """<!doctype html>
<html lang='en'>
  <head>
    <meta charset='utf-8'>
    <title>Kanban Studio Backend</title>
  </head>
  <body>
    <h1>Kanban Studio Backend</h1>
    <p>Status: running</p>
  </body>
</html>"""
