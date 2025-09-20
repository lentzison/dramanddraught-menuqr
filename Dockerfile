FROM node:20-alpine

WORKDIR /app

# Copy only the server file
COPY server.js .

# Port that CapRover expects
EXPOSE 3000

# Run directly with node
CMD ["node", "server.js"]