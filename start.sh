#!/bin/sh

echo "Starting MenuQR application..."

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy

# Seed database if needed (only on first run)
echo "Checking database seed..."
npx prisma db seed || echo "Database already seeded or seeding skipped"

# Start the application
echo "Starting Node.js server..."
npm start