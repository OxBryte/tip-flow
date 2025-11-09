#!/bin/bash

echo "🏗️ Building Ecion Backend for Railway Deployment"

# Set Node.js version for Railway
export NODE_VERSION=18.20.5

# Note: Backup directories are ignored via .gitignore and railway.json "ignore" patterns
# They won't be uploaded to Railway, but are kept locally for reference

# Only install backend dependencies  
echo "📦 Installing backend dependencies..."
cd backend-only

# Use npm ci for faster, reproducible builds (uses lockfile)
npm ci --production --frozen-lockfile || npm install --production --frozen-lockfile

echo "✅ Backend build complete - ready for Railway deployment"
