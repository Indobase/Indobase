import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ROUTES_FILE = 'site-routes.json'

export function siteRoutesPath(traefikDir) {
  const base = (traefikDir || process.env.PROVISIONER_TRAEFIK_DYNAMIC_DIR || '/mnt/traefik').trim()
  const override = (process.env.PROVISIONER_SITE_ROUTES_FILE || '').trim()
  if (override) return override
  return path.join(base, DEFAULT_ROUTES_FILE)
}

export function readSiteRoutes(traefikDir) {
  const file = siteRoutesPath(traefikDir)
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeSiteRoutes(traefikDir, routes) {
  const file = siteRoutesPath(traefikDir)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(routes, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * Register storage-first static site routing for a tenant project subdomain.
 * @param {{ ref: string, deploymentId: string, prefix?: string, storagePort?: number, traefikDir?: string }} params
 */
export function registerSiteRoute({ ref, deploymentId, prefix, storagePort, traefikDir }) {
  if (!ref || !deploymentId) {
    throw new Error('ref and deploymentId are required')
  }

  const routes = readSiteRoutes(traefikDir)
  routes[ref] = {
    deployment_id: deploymentId,
    prefix: prefix || `sites/${deploymentId}`,
    ...(storagePort != null ? { storage_port: storagePort } : {}),
    updated_at: new Date().toISOString(),
  }
  writeSiteRoutes(traefikDir, routes)
  return routes[ref]
}

export function removeSiteRoute({ ref, traefikDir }) {
  const routes = readSiteRoutes(traefikDir)
  if (!(ref in routes)) return routes
  delete routes[ref]
  writeSiteRoutes(traefikDir, routes)
  return routes
}
