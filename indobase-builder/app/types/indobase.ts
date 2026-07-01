export interface IndobaseBuilderBackendConfig {
  anon_key: string;
  api_url: string;
  auth_url: string;
  project_name: string;
  project_ref: string;
  project_url: string;
  public_env: {
    INDOBASE_ANON_KEY: string;
    INDOBASE_URL: string;
    NEXT_PUBLIC_INDOBASE_ANON_KEY: string;
    NEXT_PUBLIC_INDOBASE_URL: string;
    VITE_INDOBASE_ANON_KEY: string;
    VITE_INDOBASE_URL: string;
    EXPO_PUBLIC_INDOBASE_ANON_KEY: string;
    EXPO_PUBLIC_INDOBASE_URL: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    NEXT_PUBLIC_SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_URL: string;
    VITE_SUPABASE_ANON_KEY?: string;
    VITE_SUPABASE_URL?: string;
  };
  rest_url: string;
  storage_url: string;
}

export interface IndobaseBuilderHandoffPayload {
  aud: 'indobase-builder';
  backend: IndobaseBuilderBackendConfig;
  email: string;
  exp: number;
  iat: number;
  iss: string;
  organization_slug: string;
  project_name: string;
  project_ref: string;
  studio_url: string;
  sub: string;
}

export interface IndobaseBuilderMcpTokenPayload {
  aud: 'indobase-builder-mcp';
  email: string;
  exp: number;
  iat: number;
  iss: string;
  organization_slug: string;
  project_ref: string;
  studio_url: string;
  sub: string;
}
