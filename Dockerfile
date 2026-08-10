FROM node:20-alpine

# Prisma on Alpine needs openssl and libc6-compat
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Install deps and generate Prisma client
COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate

# Copy application source
COPY . .

ENV NODE_ENV=production
ENV PORT=80
EXPOSE 80

# Swarm only restarts a task whose container exits. A Node process that wedges
# (deadlocked pool, blocked event loop) keeps its container "running" forever,
# so the app 502s until someone triggers a rebuild by hand — that is what kept
# the site down Aug 6-10 2026. This probe makes a wedge fatal so Swarm can
# replace the task on its own. start-period covers `prisma migrate deploy`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/healthz || exit 1

# Apply pending migrations on startup, ensure one-off seed events exist, then
# run app. Migrations are managed via prisma/migrations/ — every schema change
# must be authored as a migration file (npx prisma migrate dev) and committed.
# SEED_CREATE_ONLY makes the Tiki Throwdown seed create-only, so it never
# overwrites later admin edits and is a no-op once the event exists; a seed
# failure never blocks startup.
CMD ["sh","-c","npx prisma migrate deploy && (SEED_CREATE_ONLY=1 node scripts/seed-tiki-throwdown.js || true) && node index.js"]
