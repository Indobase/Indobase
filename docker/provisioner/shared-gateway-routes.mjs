import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ROUTES_FILE = '/mnt/traefik/shared-gateway-routes.json'

export function sharedGatewayRoutesPath() {
  return (process.env.PROVISIONER_SHARED_GATEWAY_ROUTES_FILE || DEFAULT_ROUTES_FILE).trim()
}

export function readSharedGatewayRoutes() {
  const file = sharedGatewayRoutesPath()
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function writeSharedGatewayRoutes(routes) {
  const file = sharedGatewayRoutesPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(routes, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * Register tenant sidecar ports for the shared gateway multiplexer.
 * @param {string} ref
 * @param {{ rest: number, auth: number, storage: number, realtime: number, functions: number, site?: number }} ports
 */
export function registerSharedGatewayTenant(ref, ports) {
  const routes = readSharedGatewayRoutes()
  routes[ref] = {
    rest: ports.rest,
    auth: ports.auth,
    storage: ports.storage,
    realtime: ports.realtime,
    functions: ports.functions,
    ...(ports.site != null ? { site: ports.site } : {}),
  }
  writeSharedGatewayRoutes(routes)
  return routes
}

export function unregisterSharedGatewayTenant(ref) {
  const routes = readSharedGatewayRoutes()
  if (!(ref in routes)) return routes
  delete routes[ref]
  writeSharedGatewayRoutes(routes)
  return routes
}

export function portsFromPortBase(base, embedPooler = false) {
  const ports = {
    rest: base + 1,
    auth: base + 2,
    storage: base + 3,
    realtime: base + 4,
    functions: base + 5,
    site: base + 7,
  }
  if (embedPooler) {
    ports.pooler = base + 6
  }
  return ports
}

/** Infer data_plane_port_base from tenant compose host port bindings. */
export function parsePortBaseFromComposeYaml(yaml) {
  const match = String(yaml || '').match(/^\s*-\s*"?(\d{4,5}):3000/m)
  if (!match) return null
  const restPort = Number(match[1])
  if (!Number.isFinite(restPort) || restPort < 1025) return null
  return restPort - 1
}
