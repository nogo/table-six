# Table Six has no runtime dependencies and no build step, so the image is the
# Bun runtime plus the source as it lies in the repo. Bun needs a 64-bit OS —
# on the Pi that means arm64, there is no armv7 build.
FROM oven/bun:1.4.0-slim

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ src/
COPY web/ web/

# The family's database is a bind mount, never baked into the image. /data is
# only a mountpoint: the host directory carries the ownership (uid 1000). No
# RUN step anywhere, so the arm64 image cross-builds without qemu.
ENV TABLE_SIX_DB=/data/table-six.db
VOLUME /data

# The server derives "today" from the local timezone (src/dates.ts) and a
# container is UTC unless told otherwise. Override it for another kitchen.
ENV TZ=Europe/Berlin

# The language the interface is served in: `de` or `en`, one per deployment.
ENV TABLE_SIX_LANG=de

USER bun
EXPOSE 4173
CMD ["bun", "src/server.ts"]
