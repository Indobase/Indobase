export interface IndobaseBackendUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_sign_in_at: string;
}

export interface IndobaseBackendProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  created_at: string;
  status: string;
  stats?: {
    database?: {
      tables: number;
      size: string;
      size_mb?: number;
    };
    storage?: {
      objects: number;
      size: string;
      buckets?: number;
      files?: number;
      used_gb?: number;
      available_gb?: number;
    };
    functions?: {
      count: number;
      deployed?: number;
      invocations?: number;
    };
    auth?: {
      users: number;
    };
  };
}

export interface IndobaseBackendStats {
  projects: IndobaseBackendProject[];
  totalProjects: number;
}

export interface IndobaseBackendApiKey {
  name: string;
  api_key: string;
}

export interface IndobaseBackendCredentials {
  anonKey?: string;
  apiUrl?: string;
  /** @deprecated Prefer apiUrl */
  supabaseUrl?: string;
}
