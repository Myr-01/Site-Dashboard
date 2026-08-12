# Site Monitor — Fly.io üçün production image.
# Build konteksti repo kökündədir (həm server, həm client lazımdır).

# ─── 1) Server asılılıqları ────────────────────────────────────────────────
# bcrypt və sqlite3 native modullardır — node-gyp üçün build alətləri lazımdır.
# Onları ayrı mərhələdə quraşdırırıq ki, son image-a düşməsin.
FROM node:20-slim AS server-deps

WORKDIR /app/server

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      make \
      g++ \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ─── 2) Client build ──────────────────────────────────────────────────────
# Frontend eyni origin-dən servis olunur — bu, CORS ehtiyacını aradan qaldırır
# və /status səhifəsi ilə paneli bir yerdə saxlayır.
# Vercel-i saxlamaq istəyirsənsə bu mərhələni və aşağıdaki COPY-ni silmək kifayətdir.
FROM node:20-slim AS client-build

WORKDIR /app/client

COPY client/package.json client/package-lock.json ./

# QEYD: burada `npm ci` yerinə `npm install` istifadə olunur.
# Səbəb: client/package-lock.json `package.json` ilə tam sinxron deyil —
# `vitest@4` daxilən `vite@6+` (və `esbuild@0.28`) tələb edir, lock-da isə
# yalnız `vite@5` / `esbuild@0.21` alt-ağacı var. `npm ci` bunu rədd edir.
# Tətbiqin özü `vite@^5.3.1` ilə build olunur, ona görə nəticə dəyişmir.
# Lock düzəldiləndən sonra bunu yenidən `npm ci` etmək lazımdır (determinizm üçün).
RUN npm install --no-audit --no-fund

COPY client/ ./
RUN npm run build

# ─── 3) Runtime ───────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

WORKDIR /app/server

# ca-certificates: izlənən saytlara HTTPS sorğuları və WHOIS/RDAP üçün
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=client-build /app/client/dist /app/client/dist

EXPOSE 8080

# Qeyd: root kimi işləyir. Fly volume-u root sahibliyində mount edir,
# non-root istifadəçiyə keçmək üçün əlavə chown entrypoint-i lazım olardı.
CMD ["node", "index.js"]
