# NickSeer — lightweight Node image. No secrets baked in; all config is
# entered by the user at runtime and stored in the mounted /config volume.
FROM node:20-alpine

ENV NODE_ENV=production \
    PORT=5056 \
    CONFIG_DIR=/config

WORKDIR /app

# No external dependencies — nothing to install. Copy source.
COPY package.json ./
COPY server ./server
COPY public ./public

VOLUME ["/config"]
RUN mkdir -p /config

EXPOSE 5056

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5056/api/health || exit 1

CMD ["node", "server/index.js"]
