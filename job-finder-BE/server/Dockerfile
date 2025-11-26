# syntax=docker/dockerfile:1

FROM node:20-bullseye AS shared-build
WORKDIR /shared
COPY shared/ .
RUN npm install
RUN npm run build

FROM node:20-bullseye AS base
WORKDIR /app
ENV HUSKY=0
ENV HUSKY_SKIP_INSTALL=1
RUN npm install -g npm@11.6.3
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

# Codex config directory (mount from host for auth credentials)
ENV CODEX_HOME=/home/node/.codex

# Install gosu for dropping privileges, ca-certificates for TLS, npm update, and codex CLI
RUN apt-get update && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g npm@11.6.3 @openai/codex@0.63.0 \
    && npm cache clean --force \
    && mkdir -p /home/node/.codex /data/artifacts /data/sqlite \
    && chown -R node:node /home/node/.codex /data

COPY job-finder-BE/server/package.json job-finder-BE/server/package-lock.json ./
RUN sed -i 's#file:../../shared#file:./shared#g; s#"../../shared"#"./shared"#g' package.json package-lock.json
COPY --from=shared-build /shared ./shared
COPY infra/sqlite ./infra/sqlite
RUN rm package-lock.json && npm install --omit=dev --no-package-lock && npm rebuild better-sqlite3
COPY --from=base /app/dist ./dist

# Copy entrypoint script and set ownership
COPY job-finder-BE/server/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

# Entrypoint fixes volume permissions then drops to node user
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
