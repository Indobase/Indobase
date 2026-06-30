import {
  sanitizeGeneratedArtifactContent,
  sanitizeGeneratedArtifactPath,
} from '~/lib/indobase/sanitizeGeneratedArtifact';

export type TemplateFile = { name: string; path: string; content: string };

export function rebrandTemplateBundleForIndobase(files: TemplateFile[]): TemplateFile[] {
  return files.map((file) => ({
    ...file,
    path: sanitizeGeneratedArtifactPath(file.path),
    content: sanitizeGeneratedArtifactContent(file.content),
  }));
}
