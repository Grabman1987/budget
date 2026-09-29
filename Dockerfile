# syntax=docker/dockerfile:1

# ---- build: install workspaces, build web (Vite) and server (esbuild bundle) ----
FROM node:22-bookworm-slim AS build
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
    DATA_DIR=/data
WORKDIR /app
COPY --from=build /repo/apps/server/dist/index.js ./server.js
COPY --from=build /repo/apps/web/dist ./web
# Non-root; /data is the Fly volume mount for SQLite (P1d).
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
