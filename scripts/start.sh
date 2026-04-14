#!/usr/bin/env bash
set -e

echo "Starting Kanban Studio containers..."
docker compose up -d --build

echo "Running on http://localhost:8000"