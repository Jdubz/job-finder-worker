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
COPY job-finder-BE/server/src/modules/generator/templates ./dist/modules/generator/templates

FROM node:20-bullseye-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0
ENV HUSKY_SKIP_INSTALL=1

# Create non-root user for security (node user already exists in node image)
# Codex config directory (mount from host for auth credentials)
ENV CODEX_HOME=/home/node/.codex

# Install npm update and codex CLI, create config directory
RUN npm install -g npm@11.6.3 @openai/codex@0.63.0 \
    && npm cache clean --force \
    && mkdir -p /home/node/.codex \
    && chown -R node:node /home/node/.codex

COPY job-finder-BE/server/package.json job-finder-BE/server/package-lock.json ./
RUN sed -i 's#file:../../shared#file:./shared#g; s#"../../shared"#"./shared"#g' package.json package-lock.json
COPY --from=shared-build /shared ./shared
COPY infra/sqlite ./infra/sqlite
RUN rm package-lock.json && npm install --omit=dev --no-package-lock && npm rebuild better-sqlite3
COPY --from=base /app/dist ./dist

# Set ownership and switch to non-root user
RUN chown -R node:node /app
USER node

CMD ["node", "dist/index.js"]
