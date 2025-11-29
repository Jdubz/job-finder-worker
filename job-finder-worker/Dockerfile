# Multi-stage build for Job Finder (production)

# Stage 0: build Codex CLI without leaving npm/node in final image
FROM node:20-slim AS codex-builder
RUN npm install -g @openai/codex@0.58.0

# Stage 1: build Python deps
FROM python:3.12-slim as builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies (cron for scheduling, procps for pgrep, curl for healthcheck, gosu for privilege dropping, sqlite3 for agent review)
RUN apt-get update && apt-get install -y --no-install-recommends \
    cron \
    procps \
    curl \
    ca-certificates \
    gosu \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user matching API container (node user, uid 1000)
# This ensures codex session files have consistent ownership across containers
RUN groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# Codex config directory (mount from host for auth credentials)
ENV CODEX_HOME=/home/node/.codex

# Copy Python packages from builder to node user's home
COPY --from=builder /root/.local /home/node/.local

# Copy codex CLI + minimal node runtime (no npm in final image)
COPY --from=codex-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=codex-builder /usr/local/bin/codex /usr/local/bin/codex
COPY --from=codex-builder /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=codex-builder /usr/local/lib/node_modules/@openai/codex/vendor /usr/local/vendor

# Create directories for codex and data with proper ownership
RUN mkdir -p /home/node/.codex /data/sqlite \
    && chown -R node:node /home/node/.codex /home/node/.local /data

# Copy application code
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Copy cron configuration, entrypoint, and helper scripts
COPY docker/crontab /etc/cron.d/job-finder-cron
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY docker/run-now.sh /app/docker/run-now.sh

# Set proper permissions for cron and scripts
RUN chmod 0644 /etc/cron.d/job-finder-cron && \
    crontab /etc/cron.d/job-finder-cron && \
    touch /var/log/cron.log && \
    chmod +x /app/entrypoint.sh && \
    chmod +x /app/docker/run-now.sh

# Make PATH include user-installed packages (node user)
ENV PATH=/home/node/.local/bin:$PATH
ENV PYTHONPATH=/app/src:/app

# Create data and logs directories with proper ownership
RUN mkdir -p /app/data /app/logs \
    && chown -R node:node /app

# Healthcheck - check Flask worker health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5555/health || exit 1

# Use entrypoint script for better logging and startup
ENTRYPOINT ["/app/entrypoint.sh"]
