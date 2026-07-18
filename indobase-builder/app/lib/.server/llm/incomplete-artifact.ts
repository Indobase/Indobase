/**
 * Detects when a coder response was cut off mid-artifact. Providers sometimes report
 * finishReason "stop" even when output hit a soft limit mid-tag — without this check we
 * leave half-written files and never continue.
 */
export function isIncompleteBoltArtifact(content: string): boolean {
  if (!content) {
    return false;
  }

  const openArtifacts = (content.match(/<boltArtifact\b/gi) ?? []).length;
  const closeArtifacts = (content.match(/<\/boltArtifact>/gi) ?? []).length;

  if (openArtifacts > closeArtifacts) {
    return true;
  }

  const openActions = (content.match(/<boltAction\b/gi) ?? []).length;
  const closeActions = (content.match(/<\/boltAction>/gi) ?? []).length;

  return openActions > closeActions;
}
