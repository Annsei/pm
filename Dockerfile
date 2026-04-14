# Stage 1: build frontend
FROM node:20-alpine as frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
COPY frontend/next.config.ts frontend/tsconfig.json ./
COPY frontend/postcss.config.mjs ./
COPY frontend/public ./public
COPY frontend/src ./src
COPY frontend/.eslintrc* ./
COPY frontend/playwright.config.ts ./

RUN npm install
RUN npm run build

# Stage 2: backend image
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend ./backend
COPY --from=frontend-build /app/frontend/out ./frontend/out
COPY .env ./.env

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
