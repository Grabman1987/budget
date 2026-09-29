#!/bin/sh
# Fly mounts the volume at /data owned by root. Fix ownership once, then drop privileges so the
# server itself never runs as root.
set -e
if [ "$(id -u)" = "0" ]; then
  chown -R node:node "${DATA_DIR:-/data}"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
