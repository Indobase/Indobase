/** Minimal chalk stub for lean workspace vitest runs. */
type Colorizer = ((text: string) => string) & {
  [key: string]: Colorizer
}

function colorizer(): Colorizer {
  const fn = ((text: string) => String(text)) as Colorizer
  return new Proxy(fn, {
    get: () => colorizer(),
  })
}

export class Chalk {
  constructor(_opts?: { level?: number }) {}

  gray = colorizer()
  cyan = colorizer()
  yellow = colorizer()
  red = colorizer()
  green = colorizer()
  dim = colorizer()
  bold = colorizer()

  hex(_color: string) {
    return colorizer()
  }

  bgHex(_color: string) {
    return colorizer()
  }
}
