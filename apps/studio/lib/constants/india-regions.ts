/**
 * Indobase SaaS regions — Indian metros for project creation UI and control plane metadata.
 * Codes are stable slugs (not AWS region IDs) for self-hosted / single-VPS deployments.
 */
export const INDIA_REGIONS = {
  MUMBAI: {
    code: 'in-mumbai',
    displayName: 'Mumbai',
    location: [19.076, 72.8777],
  },
  DELHI: {
    code: 'in-delhi',
    displayName: 'Delhi NCR',
    location: [28.6139, 77.209],
  },
  BANGALORE: {
    code: 'in-bangalore',
    displayName: 'Bangalore',
    location: [12.9716, 77.5946],
  },
  CHENNAI: {
    code: 'in-chennai',
    displayName: 'Chennai',
    location: [13.0827, 80.2707],
  },
  HYDERABAD: {
    code: 'in-hyderabad',
    displayName: 'Hyderabad',
    location: [17.385, 78.4867],
  },
  KOLKATA: {
    code: 'in-kolkata',
    displayName: 'Kolkata',
    location: [22.5726, 88.3639],
  },
  ASSAM: {
    code: 'in-assam',
    displayName: 'Assam (Guwahati)',
    location: [26.1445, 91.7362],
  },
} as const

export const INDIA_REGION_DEFAULT = INDIA_REGIONS.MUMBAI
