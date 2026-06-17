export interface Template {
  name: string;
  label: string;
  description: string;
  githubRepo: string;
  category?: 'product' | 'content' | 'framework' | 'mobile';
  featured?: boolean;
  tags?: string[];
  icon?: string;
}
