import type { GeneratedCodeDiagnostic } from './generated-code-validation';

/** Hexes / Tailwind tokens that scream the banned AI-template purple look. */
const BANNED_PURPLE_HEX =
  /#(?:9[eE]7[fF]{2}|7[cC]3[aA][eE][dD]|8[bB]5[cC][fF]6|6366[fF]1|a855[fF]7|9333[eE][aA]|7[cC]5[cC][dD]6|4[fF]46[eE]5)\b/g;

const BANNED_PURPLE_TAILWIND =
  /\b(?:bg|text|from|to|via|border|ring|shadow|outline|fill|stroke)-(?:purple|violet|indigo)(?:-\d{2,3})?\b/g;

const BANNED_UNSPLASH = /https?:\/\/(?:images\.)?unsplash\.com\//i;

const INTER_ONLY_FONT =
  /font-family\s*:\s*(?:['"]Inter['"]|Inter)(?:\s*,\s*(?:system-ui|sans-serif|ui-sans-serif))?\s*;/i;

const STYLE_OR_UI_FILE = /\.(?:css|scss|sass|less|[cm]?[jt]sx?)$/i;

/**
 * Static visual-quality lint for generated Builder sources.
 * Failures feed the same automatic repair loop as syntax/preview errors.
 */
export function lintGeneratedVisualQuality(sources: Record<string, string>): GeneratedCodeDiagnostic[] {
  const diagnostics: GeneratedCodeDiagnostic[] = [];

  for (const [filePath, content] of Object.entries(sources)) {
    if (!STYLE_OR_UI_FILE.test(filePath)) {
      continue;
    }

    if (filePath.includes('node_modules') || filePath.includes('dist/')) {
      continue;
    }

    const purpleHex = content.match(BANNED_PURPLE_HEX);

    if (purpleHex?.length) {
      diagnostics.push({
        filePath,
        message: `Banned AI-template purple/indigo color ${purpleHex[0]} — use an industry-fit primary (e.g. brand blue #3B8FD6, navy, or warm earth tones), not purple/violet/indigo.`,
        source: 'design',
      });
    }

    const purpleTw = content.match(BANNED_PURPLE_TAILWIND);

    if (purpleTw?.length) {
      diagnostics.push({
        filePath,
        message: `Banned Tailwind purple/violet/indigo utility "${purpleTw[0]}" — replace with a bespoke palette (sky/blue/teal/amber/neutral), never purple gradients.`,
        source: 'design',
      });
    }

    if (BANNED_UNSPLASH.test(content)) {
      diagnostics.push({
        filePath,
        message:
          'Unsplash URLs are banned — use Pexels with a real known URL, local assets, or CSS/SVG atmosphere instead.',
        source: 'design',
      });
    }

    if (/\.css$/i.test(filePath) && INTER_ONLY_FONT.test(content)) {
      diagnostics.push({
        filePath,
        message:
          'Inter-only typography is banned — pair an expressive display/body font (e.g. newsreader + geometric sans) via CSS variables or Google Fonts.',
        source: 'design',
      });
    }
  }

  // Cap noise so one bad theme file does not drown the repair prompt.
  return diagnostics.slice(0, 8);
}

export function hasDesignDiagnostics(diagnostics: GeneratedCodeDiagnostic[]): boolean {
  return diagnostics.some((d) => d.source === 'design');
}
