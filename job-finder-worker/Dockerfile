# Multi-stage build for Job Finder (production)
# AI inference routes through LiteLLM proxy — no direct provider SDKs or CLIs needed

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
RUN groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --shell /bin/bash --create-home node

# Copy Python packages from builder to node user's home
COPY --from=builder /root/.local /home/node/.local

# Copy Playwright browser cache from builder (Chromium installed via 'playwright install chromium')
COPY --from=builder /root/.cache/ms-playwright /home/node/.cache/ms-playwright

# Create directories for data with proper ownership
RUN mkdir -p /home/node/.cache /data/sqlite \
    && chown -R node:node /home/node/.local /home/node/.cache /data

# Copy application code
COPY src/ ./src/
COPY config/ ./config/
COPY scripts/ ./scripts/

# Copy entrypoint and helper scripts
COPY docker/entrypoint.sh /app/entrypoint.sh
COPY docker/run-now.sh /app/docker/run-now.sh

# Set proper permissions for scripts
RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/docker/run-now.sh

# Make PATH include user-installed packages (node user)
ENV PATH=/home/node/.local/bin:$PATH
# Include app source and user site-packages so Python finds all deps
# (also set in entrypoint.sh, but ENV ensures docker exec sessions work too)
ENV PYTHONPATH=/app/src:/app:/home/node/.local/lib/python3.12/site-packages
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
