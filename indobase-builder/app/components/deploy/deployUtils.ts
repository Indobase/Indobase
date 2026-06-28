const MAX_BUILD_OUTPUT_CHARS = 4000;

export function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '').replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
}

export function formatBuildFailureOutput(output?: string) {
  const trimmed = stripAnsi(output?.trim() ?? '');

  if (!trimmed) {
    return 'Build failed with no output captured.';
  }

  if (trimmed.length <= MAX_BUILD_OUTPUT_CHARS) {
    return trimmed;
  }

  return `Build output (truncated):\n${trimmed.slice(-MAX_BUILD_OUTPUT_CHARS)}`;
}
