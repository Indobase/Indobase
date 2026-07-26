export interface Design {
  id: string;
  name: string;
  canvas_json: string;
  width: number;
  height: number;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  design_id: string;
  title: string;
  canvas_json: string;
  sort_order: number;
  created_at: string;
}

export interface DesignWithPages extends Design {
  pages: Page[];
}

export interface Template {
  id: string;
  name: string;
  category: string;
  /** Fabric JSON — may arrive as object from Postgres jsonb or string. */
  canvas_json: string | Record<string, unknown>;
  width: number;
  height: number;
  thumbnail_url: string | null;
  sort_order: number;
}

export interface BrandKit {
  id: string | null;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  text_color: string;
  font_display: string;
  font_body: string;
  logo_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}
