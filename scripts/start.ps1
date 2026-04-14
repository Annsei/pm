Write-Host "Starting Kanban Studio containers..."
docker compose up -d --build
Write-Host "Running on http://localhost:8000"