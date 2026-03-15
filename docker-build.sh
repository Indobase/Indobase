#!/usr/bin/env bash
# Build Docker image from a clean copy to avoid macOS xattr errors when repo is on
# an external volume (e.g. /Volumes/ssd). Run from repo root: ./docker-build.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
TAG="${1:-ind-repo:latest}"

echo "Building Docker image (tag: $TAG)..."
echo "Using clean copy to avoid xattr errors on external volumes."

BUILD_DIR=$(mktemp -d)
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "Copying repo to $BUILD_DIR..."
cp -R "$REPO_ROOT"/. "$BUILD_DIR/"
echo "Removing macOS resource-fork files (._*)..."
find "$BUILD_DIR" -name '._*' -delete 2>/dev/null || true

echo "Running docker build..."
cd "$BUILD_DIR"
docker build -t "$TAG" .

echo "Done. Image: $TAG"
