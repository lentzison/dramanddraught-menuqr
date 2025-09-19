#!/bin/sh

echo "Starting MenuQR application..."

# First, just try to generate Prisma client
echo "Generating Prisma Client..."
npx prisma generate

# Try migrations but don't fail if they don't work
echo "Attempting database migrations..."
npx prisma migrate deploy 2>&1 || echo "Migration skipped or failed (may be first run)"

# Try seeding but don't fail
echo "Attempting database seed..."
npx prisma db seed 2>&1 || echo "Seeding skipped (may already be seeded)"

# Start the application
echo "Starting Node.js server..."
npm start