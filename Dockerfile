# ── Stage 1: build the React client ─────────────────────────────────────────
FROM node:20-bookworm-slim AS client-build
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

# ── Stage 2: server + built client ──────────────────────────────────────────
FROM node:20-bookworm-slim
# Prisma's query engine needs OpenSSL; CA certs for TLS to Neon/Upstash.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server
COPY server/package*.json ./
# --include=dev keeps the prisma CLI, which the release step (scripts/release.sh)
# uses to run `prisma migrate deploy`.
RUN npm ci --include=dev
COPY server/ .
RUN npx prisma generate

# server.js serves ../client/dist
COPY --from=client-build /client/dist /app/client/dist

ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "server.js"]
