#!/usr/bin/env bash
# Build Docker image for linux/amd64 (for deployment on typical cloud servers).
# Fixes: "no matching manifest for linux/amd64 in the manifest list"
# Usage: ./docker-build-amd64.sh [tag]
#        ./docker-build-amd64.sh roshanraghavander/ind-repo:latest
# Then push: docker push roshanraghavander/ind-repo:latest

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TAG="${1:-ind-repo:latest}"

echo "Building Docker image for linux/amd64 (tag: $TAG)..."
echo "Using clean copy to avoid macOS xattr errors on external volumes."

BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "Copying repo to $BUILD_DIR..."
cp -R "$REPO_ROOT"/. "$BUILD_DIR/"
echo "Removing macOS resource-fork files (._*)..."
find "$BUILD_DIR" -name '._*' -delete 2>/dev/null || true

echo "Ensuring buildx builder for amd64 exists..."
if ! docker buildx inspect amd64builder &>/dev/null; then
  echo "Creating builder (required for amd64 on Apple Silicon)..."
  docker buildx create --name amd64builder --driver docker-container --use
else
  docker buildx use amd64builder
fi

echo "Building for platform linux/amd64 (this may take a while)..."
cd "$BUILD_DIR"
docker buildx build \
  --platform linux/amd64 \
  --tag "$TAG" \
  --load \
  .

echo "Done. Image (amd64): $TAG"
echo "Push with: docker push $TAG"
