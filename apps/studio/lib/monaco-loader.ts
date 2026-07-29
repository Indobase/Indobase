import { BASE_PATH } from 'lib/constants'

let configured = false
let stylesLoaded = false

export function ensureMonacoStylesLoaded() {
  if (typeof document === 'undefined' || stylesLoaded) return
  if (document.querySelector('[data-name="vs/editor/editor.main"]')) {
    stylesLoaded = true
    return
  }

  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.type = 'text/css'
  link.href = `${BASE_PATH}/monaco-editor/editor/editor.main.css`
  link.setAttribute('data-name', 'vs/editor/editor.main')
  document.head.appendChild(link)
  stylesLoaded = true
}

export async function configureMonacoLoader() {
  if (configured || typeof window === 'undefined') return

  ensureMonacoStylesLoaded()

  const { loader } = await import('@monaco-editor/react')
  loader.config({
    paths: {
      vs: `${BASE_PATH}/monaco-editor`,
    },
  })
  configured = true
}

export async function ensureMonacoIndobaseTheme(resolvedTheme: string) {
  await configureMonacoLoader()
  const { default: monaco } = await import('monaco-editor')
  const isDarkMode = resolvedTheme.includes('dark')
  monaco.editor.defineTheme('indobase', {
    base: isDarkMode ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', background: isDarkMode ? '1f1f1f' : 'f0f0f0' },
      {
        token: '',
        background: isDarkMode ? '1f1f1f' : 'f0f0f0',
        foreground: isDarkMode ? 'd4d4d4' : '444444',
      },
      { token: 'string.sql', foreground: '24b47e' },
      { token: 'comment', foreground: '666666' },
      { token: 'predefined.sql', foreground: isDarkMode ? 'D4D4D4' : '444444' },
    ],
    colors: { 'editor.background': isDarkMode ? '#1f1f1f' : '#f0f0f0' },
  })
}
