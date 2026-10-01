# syntax=docker/dockerfile:1

# ---- build: install workspaces, build web (Vite) and server (esbuild bundle) ----
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build
# Base images are pinned by digest (the tag is only for humans); Dependabot proposes new digests.
# No compiler toolchain: .npmrc sets ignore-scripts=true and better-sqlite3 ships prebuilt binaries.
WORKDIR /repo
COPY .npmrc package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY packages/market/package.json packages/market/
COPY packages/ui/package.json packages/ui/
RUN npm ci
# Fail the build here, not at runtime, if the native driver cannot load without a build step.
RUN node -e "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
# The web build reads the self-hosted fonts from the design prototype.
COPY design/prototype/fonts design/prototype/fonts
RUN npm run build

# ---- litestream: pinned release, checksum-verified, one binary per target architecture ----
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS litestream
ARG TARGETARCH
ARG LITESTREAM_VERSION=0.5.17
# SHA-256 of litestream-<version>-linux-<arch>.tar.gz, from the release's checksums.txt.
ARG LITESTREAM_SHA256_AMD64=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ARG LITESTREAM_SHA256_ARM64=f8ca4a050095c1efbda2c4365172e61bf9d955ea0d9ac42f448b52e51819baa5
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) arch=x86_64; sha="$LITESTREAM_SHA256_AMD64" ;; \
      arm64) arch=arm64; sha="$LITESTREAM_SHA256_ARM64" ;; \
      *) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    file="litestream-${LITESTREAM_VERSION}-linux-${arch}.tar.gz"; \
    curl -fsSL -o "/tmp/$file" "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/$file"; \
    echo "$sha  /tmp/$file" | sha256sum -c -; \
    tar -xzf "/tmp/$file" -C /usr/local/bin litestream; \
    litestream version

# ---- runtime: the server is one bundled file, the web app is static ----
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIR=/app/web \
    BUDGET_MIGRATIONS_DIR=/app/drizzle \
    DATA_DIR=/data
# ca-certificates: Litestream (Go) verifies the object storage endpoint against the system roots.
# age: encrypts the nightly backup to the owner's public key (docs/ops.md section 8).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates age \
 && rm -rf /var/lib/apt/lists/* \
 && age --version
WORKDIR /app
COPY --from=build /repo/apps/server/dist/index.js ./server.js
# Import tasks (YNAB dry run, commit, revert) run in a worker thread loaded from this file.
COPY --from=build /repo/apps/server/dist/import-worker.js ./import-worker.js
COPY --from=build /repo/apps/web/dist ./web
# SQL migrations (applied at start) and the native SQLite driver, which esbuild leaves external.
COPY --from=build /repo/packages/db/drizzle ./drizzle
COPY --from=build /repo/node_modules/better-sqlite3/package.json ./node_modules/better-sqlite3/package.json
COPY --from=build /repo/node_modules/better-sqlite3/lib ./node_modules/better-sqlite3/lib
# glibc prebuilds only (this image is bookworm): linux-x64 and linux-arm64, not macOS/Windows/musl.
COPY --from=build /repo/node_modules/better-sqlite3/prebuilds/linux-*.node ./node_modules/better-sqlite3/prebuilds/
# Litestream replicates /data/budget.sqlite to object storage when configured (see docs/ops.md).
COPY --from=litestream /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
# /data is the Fly volume mount for SQLite. The entrypoint fixes its ownership, restores the
# database from the replica if the volume is empty and then runs the server (under Litestream when
# replication is configured) as the unprivileged `node` user. Only /data belongs to `node`: the
# code in /app stays owned by root, so the server process cannot modify it.
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /data && chown node:node /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
