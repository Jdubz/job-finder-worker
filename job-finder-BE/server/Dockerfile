# syntax=docker/dockerfile:1

FROM node:20-bullseye AS shared-build
WORKDIR /shared
COPY shared/ .
RUN npm install --ignore-scripts && npm run build

FROM node:20-bullseye AS base
WORKDIR /app
ENV HUSKY=0
ENV HUSKY_SKIP_INSTALL=1
RUN npm install -g npm@11.6.3
# Install minimal deps for dev/hotreload (gosu used for privilege dropping in both dev and prod)
RUN apt-get update && apt-get install -y --no-install-recommends chromium gosu && rm -rf /var/lib/apt/lists/*
COPY job-finder-BE/server/package.json job-finder-BE/server/package-lock.json ./
# Adjust monorepo file dependency to match container layout (shared copied into /app/shared)
RUN sed -i 's#file:../../shared#file:./shared#g; s#"../../shared"#"./shared"#g' package.json package-lock.json
COPY --from=shared-build /shared ./shared
COPY infra/sqlite ./infra/sqlite
RUN rm package-lock.json && npm install --no-package-lock && npm rebuild better-sqlite3
COPY job-finder-BE/server/ .
RUN npm run build

FROM node:20-bullseye-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
ENV HUSKY_SKIP_INSTALL=1
ENV TZ=America/Los_Angeles

# Chromium path for Playwright PDF generation
ENV CHROMIUM_PATH=/usr/bin/chromium

# Install gosu for dropping privileges, ca-certificates for TLS, chromium for PDF generation, npm update, and Claude CLI
# Note: Only claude.cli is supported for CLI interface. gemini.api uses the Google Generative AI SDK.
RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates chromium tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@11.6.3 @anthropic-ai/claude-code@2.0.52 \
    && npm cache clean --force \
    && mkdir -p /data/artifacts /data/sqlite \
    && chown -R node:node /data

COPY job-finder-BE/server/package.json job-finder-BE/server/package-lock.json ./
RUN sed -i 's#file:../../shared#file:./shared#g; s#"../../shared"#"./shared"#g' package.json package-lock.json
COPY --from=shared-build /shared ./shared
COPY infra/sqlite ./infra/sqlite
RUN rm package-lock.json && npm install --omit=dev --no-package-lock && npm rebuild better-sqlite3
COPY --from=base /app/dist ./dist

# Copy entrypoint script
COPY job-finder-BE/server/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

# Entrypoint fixes volume permissions then drops to node user
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
