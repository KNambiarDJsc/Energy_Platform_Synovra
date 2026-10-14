# Synovra API image. Build from the repository root:  docker build -f server/Dockerfile .
FROM node:20.17-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
RUN npx tsup server/src/index.ts server/src/cli.ts --format esm --platform node --target node20 --out-dir server/dist --clean

FROM node:20.17-alpine
WORKDIR /app
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/server/drizzle
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
COPY server/drizzle ./server/drizzle
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "server/dist/index.mjs"]
