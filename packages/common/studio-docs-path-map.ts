import mapJson from './studio-docs-path-map.json'

export type StudioDocsPathMap = {
  prefixes: ReadonlyArray<readonly [string, string]>
  exact: Readonly<Record<string, string>>
}

export const STUDIO_DOCS_PATH_MAP = mapJson as StudioDocsPathMap

/** Longest prefix first. */
export const STUDIO_DOCS_PREFIXES = [...STUDIO_DOCS_PATH_MAP.prefixes].sort(
  (a, b) => b[0].length - a[0].length
)
