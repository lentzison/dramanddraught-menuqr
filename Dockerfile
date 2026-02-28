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

# Apply schema changes on startup then run app
CMD ["sh","-c","npx prisma db push && node index.js"]
