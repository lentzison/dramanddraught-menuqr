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

# Apply pending migrations on startup then run app.
# Migrations are managed via prisma/migrations/ — every schema change must
# be authored as a migration file (npx prisma migrate dev) and committed.
CMD ["sh","-c","npx prisma migrate deploy && node index.js"]
