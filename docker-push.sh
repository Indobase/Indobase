#!/usr/bin/env bash
# Tag and push the built image to Docker Hub.
# Usage: ./docker-push.sh <docker_hub_username> [tag]
#   Or:  DOCKER_HUB_USER=myuser ./docker-push.sh
# Example: ./docker-push.sh myuser
#          ./docker-push.sh myuser v1.0.0

set -e
USER="${1:-$DOCKER_HUB_USER}"
TAG="${2:-latest}"
IMAGE="ind-repo"

if [ -z "$USER" ]; then
  echo "Usage: $0 <docker_hub_username> [tag]"
  echo "   Or: DOCKER_HUB_USER=myuser $0 [tag]"
  echo "Pushes $IMAGE:latest as $USER/$IMAGE:$TAG to Docker Hub."
  exit 1
fi

REMOTE="$USER/$IMAGE:$TAG"
echo "Tagging $IMAGE:latest as $REMOTE..."
docker tag "$IMAGE:latest" "$REMOTE"
echo "Pushing $REMOTE..."
docker push "$REMOTE"
echo "Done. Image pushed to Docker Hub: $REMOTE"
