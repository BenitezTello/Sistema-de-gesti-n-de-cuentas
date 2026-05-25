# ═══════════════════════════════════════════════════════════════
#  Dockerfile — App (Frontend + API + SQLite)
#  Sin Chromium — liviano
# ═══════════════════════════════════════════════════════════════

# Stage 1: Build React
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: App server
FROM node:20-slim
WORKDIR /app

# Usar package-app.json (solo deps del app, sin puppeteer)
COPY server/package-app.json ./server/package.json
# better-sqlite3 es nativo y DEBE compilarse dentro del contenedor Linux
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
RUN cd server && npm install

COPY server/ ./server/
COPY --from=frontend-builder /app/dist ./dist

RUN mkdir -p /app/server/data

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "server/index.js"]
