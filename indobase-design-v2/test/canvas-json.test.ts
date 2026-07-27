import { parseCanvasJson } from '../src/client/utils/canvas-json.js'

let fail = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.log(`      ! ${msg}`)
    fail++
  }
}

const obj = { version: '6.0.0', background: '#fff', objects: [{ type: 'Rect' }] }
assert(parseCanvasJson(obj).background === '#fff', 'object passthrough')
assert(parseCanvasJson(JSON.stringify(obj)).background === '#fff', 'string parse')
assert(Array.isArray(parseCanvasJson(null).objects), 'null → empty')
assert(Array.isArray(parseCanvasJson('not-json').objects), 'bad string → empty')
// Regression: JSON.parse(object) would throw — this is what stuck templates on Loading…
try {
  JSON.parse(obj as unknown as string)
  console.log('      ! unexpected: JSON.parse(object) did not throw')
  fail++
} catch {
  // expected
}
assert(parseCanvasJson(obj as unknown as string).version === '6.0.0', 'object-as-any still works')

console.log(`\n  canvas-json tests: ${fail} problems`)
process.exit(fail ? 1 : 0)
