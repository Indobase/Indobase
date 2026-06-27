const reset = '\x1b[0m';

export const escapeCodes = {
  reset,
  clear: '\x1b[g',
  red: '\x1b[1;31m',
  yellow: '\x1b[1;33m',
  green: '\x1b[1;32m',
  dim: '\x1b[2m',
};

function color(code: string, text: string) {
  return `${code}${text}${reset}`;
}

export const coloredText = {
  red: (text: string) => color(escapeCodes.red, text),
  yellow: (text: string) => color(escapeCodes.yellow, text),
  green: (text: string) => color(escapeCodes.green, text),
  dim: (text: string) => color(escapeCodes.dim, text),
};
