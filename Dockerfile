# ==============================================================================
# SentinelMind Multi-Stage Dockerfile
# Stage 1: Build the React TypeScript Frontend
# Stage 2: Python 3.11 Slim Production Server with Mounted Static Assets
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Frontend Assets
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web

# Install frontend dependencies
COPY web/package*.json ./
RUN npm install

# Copy frontend source and build optimized distribution
COPY web/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Python Runtime Environment
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

# Set environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    DOCKER_CONTAINER=true \
    RUNTIME_ENV=docker

WORKDIR /app

# Install curl for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application backend package and server runner
COPY sentinelmind/ ./sentinelmind/
COPY server.py ./

# Copy compiled frontend distribution from Stage 1
COPY --from=frontend-builder /app/web/dist ./web/dist

# Create runtime directories for logs, runs, and SQLite persistence
RUN mkdir -p /app/runs /app/data

# Expose SentinelMind application port
EXPOSE 8000

# Docker healthcheck checking the live API health endpoint
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start Uvicorn serving both FastAPI backend and React frontend
CMD ["python", "-m", "uvicorn", "sentinelmind.api:app", "--host", "0.0.0.0", "--port", "8000"]
