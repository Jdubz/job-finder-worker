# Multi-stage build for Job Finder (production)

# Stage 0: build Codex CLI and Gemini CLI without leaving npm in final image
FROM node:20-slim AS cli-builder
RUN npm install -g @openai/codex@0.58.0 @google/gemini-cli@0.18.4 @anthropic-ai/claude-code@2.0.52

# Stage 1: build Python deps and install Playwright browsers
FROM python:3.12-slim as builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies + Playwright browser
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt && \
    /root/.local/bin/playwright install chromium

# Production stage
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies (sorted alphabetically for maintainability)
# Includes Chromium dependencies for Playwright JS rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    gosu \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    procps \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user matching API container (node user, uid 1000)
# This ensures codex session files have consistent ownership across containers
RUN groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# AI CLI config directories (mount from host for auth credentials)
ENV CODEX_HOME=/home/node/.codex
ENV GEMINI_HOME=/home/node/.gemini

# Copy Python packages from builder to node user's home
COPY --from=builder /root/.local /home/node/.local

# Copy Playwright browser cache from builder (Chromium installed via 'playwright install chromium')
COPY --from=builder /root/.cache/ms-playwright /home/node/.cache/ms-playwright

# Copy Codex CLI + minimal node runtime (no npm in final image)
COPY --from=cli-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=cli-builder /usr/local/lib/node_modules/@openai/codex /usr/local/lib/node_modules/@openai/codex
COPY --from=cli-builder /usr/local/lib/node_modules/@openai/codex/vendor /usr/local/vendor
RUN printf '#!/bin/sh\nexec node /usr/local/lib/node_modules/@openai/codex/bin/codex.js "$@"\n' > /usr/local/bin/codex && chmod +x /usr/local/bin/codex

# Copy Gemini CLI
COPY --from=cli-builder /usr/local/lib/node_modules/@google/gemini-cli /usr/local/lib/node_modules/@google/gemini-cli
RUN printf '#!/bin/sh\nexec node /usr/local/lib/node_modules/@google/gemini-cli/dist/index.js "$@"\n' > /usr/local/bin/gemini && chmod +x /usr/local/bin/gemini

# Copy Claude CLI
COPY --from=cli-builder /usr/local/lib/node_modules/@anthropic-ai/claude-code /usr/local/lib/node_modules/@anthropic-ai/claude-code
RUN printf '#!/bin/sh\nexec node /usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js "$@"\n' > /usr/local/bin/claude && chmod +x /usr/local/bin/claude

# Create directories for AI CLIs and data with proper ownership
RUN mkdir -p /home/node/.codex /home/node/.gemini /home/node/.cache /data/sqlite \
    && chown -R node:node /home/node/.codex /home/node/.gemini /home/node/.local /home/node/.cache /data

# Copy application code
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Copy entrypoint and helper scripts
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY docker/run-now.sh /app/docker/run-now.sh
COPY docker/codex-safe /usr/local/bin/codex-safe

# Set proper permissions for scripts
RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/docker/run-now.sh && \
    chmod +x /usr/local/bin/codex-safe

# Make PATH include user-installed packages (node user)
ENV PATH=/home/node/.local/bin:$PATH
# PYTHONPATH is set dynamically in entrypoint.sh to avoid hardcoding Python version
# Tell Playwright where to find browsers (installed during build)
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

# Create data and logs directories with proper ownership
RUN mkdir -p /app/data /app/logs \
    && chown -R node:node /app

# Healthcheck - check Flask worker health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:5555/health || exit 1

# Use entrypoint script for better logging and startup
ENTRYPOINT ["/app/entrypoint.sh"]
