#!/usr/bin/env bash
set -euo pipefail

APP_NAME="telegram-agent"
REGISTRY="registry.digitalocean.com/your-registry"
TAG="$(git rev-parse --short HEAD)"

echo "Building Docker image..."
docker build -t "$APP_NAME:$TAG" .
docker tag "$APP_NAME:$TAG" "$REGISTRY/$APP_NAME:$TAG"
docker tag "$APP_NAME:$TAG" "$REGISTRY/$APP_NAME:latest"

echo "Pushing to registry..."
docker push "$REGISTRY/$APP_NAME:$TAG"
docker push "$REGISTRY/$APP_NAME:latest"

echo "Triggering Digital Ocean App Platform deployment..."
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/apps/$DO_APP_ID/deployments" \
  -d '{"force_build": true}'

echo "Deployment triggered successfully."
