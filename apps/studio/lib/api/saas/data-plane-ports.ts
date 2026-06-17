/** Ports base+1 … base+7 (optional +6 pooler) must not overlap across tenant stacks. */
export const DATA_PLANE_PORT_BLOCK_SIZE = 8
export const DATA_PLANE_PORT_MIN = 12000
export const DATA_PLANE_PORT_RANGE = 38000

export function computeDataPlanePortBase(projectRef: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < projectRef.length; i++) {
    h ^= projectRef.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return DATA_PLANE_PORT_MIN + (h % DATA_PLANE_PORT_RANGE)
}

export function dataPlanePortBasesCollide(a: number, b: number): boolean {
  return Math.abs(a - b) < DATA_PLANE_PORT_BLOCK_SIZE
}

export function isDataPlanePortBaseAvailable(
  candidate: number,
  occupiedBases: number[]
): boolean {
  if (!Number.isFinite(candidate) || candidate < DATA_PLANE_PORT_MIN) return false
  if (candidate + DATA_PLANE_PORT_BLOCK_SIZE > DATA_PLANE_PORT_MIN + DATA_PLANE_PORT_RANGE) {
    return false
  }
  return occupiedBases.every((base) => !dataPlanePortBasesCollide(candidate, base))
}

export function resolveDataPlanePortBase(projectRef: string, occupiedBases: number[]): number {
  const preferred = computeDataPlanePortBase(projectRef)
  if (isDataPlanePortBaseAvailable(preferred, occupiedBases)) {
    return preferred
  }

  for (let offset = 1; offset < DATA_PLANE_PORT_RANGE; offset++) {
    const next =
      DATA_PLANE_PORT_MIN + ((preferred - DATA_PLANE_PORT_MIN + offset) % DATA_PLANE_PORT_RANGE)
    if (isDataPlanePortBaseAvailable(next, occupiedBases)) {
      return next
    }
  }

  throw new Error('No available data-plane port block')
}
