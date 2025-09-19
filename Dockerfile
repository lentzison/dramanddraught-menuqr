# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better caching
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
# If this is Next.js, make sure you have "build": "next build" in package.json
RUN npm run build

# ---- Run stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Only bring what we need to run
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev

# Bring built app
COPY --from=build /app ./

# The app must listen on 3000 for CapRover
EXPOSE 3000
# If Next.js, ensure package.json has: "start": "next start -p 3000"
CMD ["npm", "start"]