/**
 * Limit concurrent Fabric StaticCanvas thumbnail renders so home with 1500+
 * templates doesn't freeze the main thread. Pair with TemplateGrid windowing
 * and TemplateCard IntersectionObserver lazy thumbs.
 */
let active = 0
const queue: Array<() => void> = []
const MAX = 2

function pump() {
  while (active < MAX && queue.length > 0) {
    const next = queue.shift()
    if (!next) return
    active++
    next()
  }
}

export function enqueueThumbRender<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--
          pump()
        })
    }
    queue.push(run)
    pump()
  })
}
