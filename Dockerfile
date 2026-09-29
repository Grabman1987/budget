# syntax=docker/dockerfile:1

# ---- build: install workspaces, build web (Vite) and server (esbuild bundle) ----
FROM node:22-bookworm-slim AS build
# npm runs node-gyp for better-sqlite3 (a no-op that still needs python and make: the package ships prebuilds).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY packages/ui/package.json packages/ui/
RUN npm ci
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
# The web build reads the self-hosted fonts from the design prototype.
COPY design/prototype/fonts design/prototype/fonts
RUN npm run build

# ---- runtime: the server is one bundled file, the web app is static ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/app/web \
    BUDGET_MIGRATIONS_DIR=/app/drizzle \
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /repo/apps/server/dist/index.js ./server.js
COPY --from=build /repo/apps/web/dist ./web
# SQL migrations (applied at start) and the native SQLite driver, which esbuild leaves external.
COPY --from=build /repo/packages/db/drizzle ./drizzle
COPY --from=build /repo/node_modules/better-sqlite3/package.json ./node_modules/better-sqlite3/package.json
COPY --from=build /repo/node_modules/better-sqlite3/lib ./node_modules/better-sqlite3/lib
COPY --from=build /repo/node_modules/better-sqlite3/prebuilds ./node_modules/better-sqlite3/prebuilds
# /data is the Fly volume mount for SQLite. The entrypoint fixes its ownership and then runs the
# server as the unprivileged `node` user.
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data && chown -R node:node /data /app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
