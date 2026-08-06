import { Platform } from '~/lib/platform';

/**
 * Resolve Project Runtime ABI + prompt-safe capability appendix for codegen.
 * Thin Builder bridge — Capability Resolver is the gateway, not ad-hoc product hosts.
 */
export function getGenerationCapabilityPromptAppendix(input: {
  projectRef?: string;
  apiUrl?: string;
  anonKey?: string;
}): string {
  const projectRef = input.projectRef?.trim();
  const apiUrl = input.apiUrl?.trim();
  const anonKey = input.anonKey?.trim();

  if (!projectRef || !apiUrl || !anonKey) {
    return '';
  }

  const runtime = Platform.resolve({
    projectRef,
    dataPlane: { url: apiUrl, anonKey },
  });

  return Platform.formatGenerationCapabilityContextPrompt(runtime);
}
