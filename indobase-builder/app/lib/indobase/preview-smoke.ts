/**
 * Lightweight preview HTML smoke checks (no full Playwright agent yet).
 * Catches broken scaffolds; does not pretend to detect client-only Vite overlays.
 */

import type { GeneratedCodeDiagnostic } from './generated-code-validation';
import { GeneratedCodeValidationError, isTransientPreviewErrorMessage } from './generated-code-validation';

const EMPTY_APP_SHELL = /<div\s+id=["'](?:root|app)["']\s*>\s*<\/div>/i;

export async function smokeCheckPreviewHtml(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): Promise<GeneratedCodeDiagnostic[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/`;
  const diagnostics: GeneratedCodeDiagnostic[] = [];

  try {
    const response = await fetcher(url);

    if (!response.ok) {
      const message = `Preview HTML returned HTTP ${response.status}`;

      if (!isTransientPreviewErrorMessage(message)) {
        diagnostics.push({ filePath: 'index.html', message, source: 'preview' });
      }

      return diagnostics;
    }

    const html = await response.text();

    // Extremely empty shell with no module script is usually a broken scaffold.
    if (EMPTY_APP_SHELL.test(html) && !/<script\b[^>]*type=["']module["']/i.test(html)) {
      diagnostics.push({
        filePath: 'index.html',
        message: 'Preview shell has an empty #root/#app and no module entry script.',
        source: 'structure',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!isTransientPreviewErrorMessage(message)) {
      diagnostics.push({ filePath: 'index.html', message, source: 'preview' });
    }
  }

  return diagnostics;
}

export async function assertPreviewSmokeHealthy(baseUrl: string, fetcher: typeof fetch = fetch): Promise<void> {
  const diagnostics = await smokeCheckPreviewHtml(baseUrl, fetcher);

  if (diagnostics.length > 0) {
    throw new GeneratedCodeValidationError(diagnostics, 'Preview smoke check failed');
  }
}
