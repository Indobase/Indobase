import { ORCHESTRATOR_REPAIR_USER_PREFIX } from '~/lib/orchestration/prompts';
import type { GeneratedCodeDiagnostic } from './generated-code-validation';

export const MAX_AUTOMATIC_PREVIEW_REPAIRS = 3;

const MAX_FILE_CONTEXT_CHARS = 16_000;

type RepairFile = { type: 'file'; content: string };
type RepairFiles = Record<string, RepairFile | { type: string } | undefined>;

export type AutomaticRepairDecision =
  | { shouldRepair: false; nextAttempt: number; reason: 'exhausted' | 'no-error' }
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

  if (options.completedAttempts >= maxAttempts) {
    return { shouldRepair: false, nextAttempt: options.completedAttempts, reason: 'exhausted' };
  }

  const diagnostics = diagnosticsFromError(options.error);
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
    prompt: `${ORCHESTRATOR_REPAIR_USER_PREFIX}${errorText}

Automatic focused repair attempt ${nextAttempt} of ${maxAttempts}.
${fileContext}

Fix only the implicated file(s) and any directly required import. Preserve the rest of the project and its design. Emit complete replacement file actions for changed files only. Do not regenerate the project, do not run a planner, and do not emit quick actions.`,
  };
}
