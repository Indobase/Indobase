import { ORCHESTRATOR_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';
import { isTransientPreviewError, type GeneratedCodeDiagnostic } from './generated-code-validation';
import { hasDesignDiagnostics } from './visual-quality-lint';

export const MAX_AUTOMATIC_PREVIEW_REPAIRS = 3;

const MAX_FILE_CONTEXT_CHARS = 16_000;

type RepairFile = { type: 'file'; content: string };
type RepairFiles = Record<string, RepairFile | { type: string } | undefined>;

export type AutomaticRepairDecision =
  | { shouldRepair: false; nextAttempt: number; reason: 'exhausted' | 'no-error' | 'transient' }
  | { shouldRepair: true; nextAttempt: number; prompt: string; implicatedFiles: string[] };

function diagnosticsFromError(error: unknown): GeneratedCodeDiagnostic[] {
  if (!error || typeof error !== 'object' || !Array.isArray((error as { diagnostics?: unknown }).diagnostics)) {
    return [];
  }

  return (error as { diagnostics: GeneratedCodeDiagnostic[] }).diagnostics;
}

function findFile(files: RepairFiles, filePath: string): RepairFile | undefined {
  const normalized = filePath.replace(/^\/+/, '');
  const entry = Object.entries(files).find(
    ([candidate, value]) =>
      value?.type === 'file' &&
      (candidate.replace(/^\/+/, '') === normalized || candidate.replace(/^\/+/, '').endsWith(`/${normalized}`)),
  )?.[1];

  return entry?.type === 'file' ? entry : undefined;
}

function buildRepairPrompt(options: {
  errorText: string;
  nextAttempt: number;
  maxAttempts: number;
  fileContext: string;
  diagnostics: GeneratedCodeDiagnostic[];
}): string {
  const designOnly =
    options.diagnostics.length > 0 &&
    options.diagnostics.every((d) => d.source === 'design') &&
    hasDesignDiagnostics(options.diagnostics);

  if (designOnly) {
    return `${ORCHESTRATOR_REPAIR_USER_PREFIX}${options.errorText}

Automatic visual-quality repair attempt ${options.nextAttempt} of ${options.maxAttempts}.
${options.fileContext}

This is a DESIGN polish pass — the app already compiles. Fix ONLY the implicated style/UI file(s):
- Replace every purple/violet/indigo primary, gradient, or Tailwind utility with an industry-fit palette
- Remove Unsplash URLs; use Pexels, local assets, or CSS/SVG atmosphere
- Replace Inter-only stacks with a purposeful font pairing
- Keep layout structure and interactions; do not regenerate the whole project
Keep the project's existing JSX/TSX authoring style. Emit complete replacement file actions for the implicated files only. Do not run a planner and do not emit quick actions.`;
  }

  return `${ORCHESTRATOR_REPAIR_USER_PREFIX}${options.errorText}

Automatic focused repair attempt ${options.nextAttempt} of ${options.maxAttempts}.
${options.fileContext}

Fix ONLY the implicated file(s) listed above and any directly required import. Every other project file already exists on disk and is correct — do not touch, re-emit, or recreate them, and NEVER regenerate the whole project. Keep the project's existing JSX/TSX authoring style (do not switch to React.createElement). Emit complete replacement file actions for the implicated files only. Do not run a planner and do not emit quick actions.`;
}

export function decideAutomaticPreviewRepair(options: {
  error: unknown;
  completedAttempts: number;
  files: RepairFiles;
  maxAttempts?: number;
}): AutomaticRepairDecision {
  const maxAttempts = options.maxAttempts ?? MAX_AUTOMATIC_PREVIEW_REPAIRS;

  if (!options.error) {
    return { shouldRepair: false, nextAttempt: options.completedAttempts, reason: 'no-error' };
  }

  /*
   * Transient network/preview flakiness ("Failed to fetch", connection resets, gateway timeouts)
   * is not repairable by the model. It must be retried by the caller and must NEVER consume the
   * bounded repair budget — Bean & Bloom burned all 3 repairs on fetch races against a healthy app.
   */
  if (isTransientPreviewError(options.error)) {
    return { shouldRepair: false, nextAttempt: options.completedAttempts, reason: 'transient' };
  }

  if (options.completedAttempts >= maxAttempts) {
    return { shouldRepair: false, nextAttempt: options.completedAttempts, reason: 'exhausted' };
  }

  const diagnostics = diagnosticsFromError(options.error);

  // Design-only polish: one attempt max so we don't burn the full syntax repair budget on style.
  const designOnly =
    diagnostics.length > 0 && diagnostics.every((d) => d.source === 'design') && hasDesignDiagnostics(diagnostics);

  if (designOnly && options.completedAttempts >= 1) {
    return { shouldRepair: false, nextAttempt: options.completedAttempts, reason: 'exhausted' };
  }
  const implicatedFiles = [...new Set(diagnostics.map((diagnostic) => diagnostic.filePath).filter(Boolean))].slice(
    0,
    4,
  );
  const errorText = options.error instanceof Error ? options.error.message : String(options.error);
  const fileContext = implicatedFiles
    .map((filePath) => {
      const file = findFile(options.files, filePath);
      return file
        ? `\n<implicated_file path="${filePath}">\n${file.content.slice(0, MAX_FILE_CONTEXT_CHARS)}\n</implicated_file>`
        : '';
    })
    .filter(Boolean)
    .join('\n');
  const nextAttempt = options.completedAttempts + 1;

  return {
    shouldRepair: true,
    nextAttempt,
    implicatedFiles,
    prompt: buildRepairPrompt({
      errorText,
      nextAttempt,
      maxAttempts,
      fileContext,
      diagnostics,
    }),
  };
}
