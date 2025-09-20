FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (if any)
RUN npm ci --only=production || true

# Copy application files
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "server.js"]