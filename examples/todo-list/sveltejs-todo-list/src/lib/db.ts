import { createClient } from "@indobaseinc/indobase-js";
import type { Database } from "./schema";

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
