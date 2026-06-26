import type { ITheme } from '@xterm/xterm';

function resolveCssVariable(variable: string, property: 'color' | 'background-color'): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const probe = document.createElement('span');
  probe.style.setProperty(property, `var(${variable})`);
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.documentElement.appendChild(probe);

  const computed = getComputedStyle(probe);
  const value = property === 'color' ? computed.color : computed.backgroundColor;

  probe.remove();

  if (!value || value === 'rgba(0, 0, 0, 0)') {
    return undefined;
  }

  return value;
}

const cssColor = (token: string) => resolveCssVariable(token, 'color');
const cssBackground = (token: string) => resolveCssVariable(token, 'background-color');

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssColor('--bolt-elements-terminal-cursorColor'),
    cursorAccent: cssColor('--bolt-elements-terminal-cursorColorAccent'),
    foreground: cssColor('--bolt-elements-terminal-textColor'),
    background: cssBackground('--bolt-elements-terminal-backgroundColor'),
    selectionBackground: cssBackground('--bolt-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssColor('--bolt-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssBackground('--bolt-elements-terminal-selection-backgroundColorInactive'),

    black: cssColor('--bolt-elements-terminal-color-black'),
    red: cssColor('--bolt-elements-terminal-color-red'),
    green: cssColor('--bolt-elements-terminal-color-green'),
    yellow: cssColor('--bolt-elements-terminal-color-yellow'),
    blue: cssColor('--bolt-elements-terminal-color-blue'),
    magenta: cssColor('--bolt-elements-terminal-color-magenta'),
    cyan: cssColor('--bolt-elements-terminal-color-cyan'),
    white: cssColor('--bolt-elements-terminal-color-white'),
    brightBlack: cssColor('--bolt-elements-terminal-color-brightBlack'),
    brightRed: cssColor('--bolt-elements-terminal-color-brightRed'),
    brightGreen: cssColor('--bolt-elements-terminal-color-brightGreen'),
    brightYellow: cssColor('--bolt-elements-terminal-color-brightYellow'),
    brightBlue: cssColor('--bolt-elements-terminal-color-brightBlue'),
    brightMagenta: cssColor('--bolt-elements-terminal-color-brightMagenta'),
    brightCyan: cssColor('--bolt-elements-terminal-color-brightCyan'),
    brightWhite: cssColor('--bolt-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
