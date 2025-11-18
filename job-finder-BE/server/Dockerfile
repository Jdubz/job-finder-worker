# syntax=docker/dockerfile:1

FROM node:20-bullseye AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bullseye-slim AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=base /app/dist ./dist
CMD ["node", "dist/index.js"]
