FROM node:20-alpine
WORKDIR /app

# Copy all files
COPY . .

# Expose port
EXPOSE 3000

# Start the test app
CMD ["node", "test.js"]