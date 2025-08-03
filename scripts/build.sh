#!/bin/bash

# Build and deploy script for Rinha Backend 2025

set -e

echo "🐳 Building Docker images..."
docker compose build

echo "🚀 Starting services..."
docker compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

echo "🔍 Checking service health..."
curl -f http://localhost:9999/health || echo "Health check failed"

echo "✅ Deployment completed!"
echo "📊 Services running:"
docker compose ps

echo "📝 Logs available with: docker compose logs -f" 