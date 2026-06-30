import { describe, expect, it } from 'vitest';
import { rebrandTemplateBundleForIndobase } from './rebrandTemplateBundle';

describe('rebrandTemplateBundleForIndobase', () => {
  it('rebrands supabase env vars and client imports in imported template files', () => {
    const [file] = rebrandTemplateBundleForIndobase([
      {
        name: 'client.ts',
        path: 'src/lib/supabase.ts',
        content: `import { createClient } from '@supabase/supabase-js';\nexport const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);`,
      },
    ]);

    expect(file.path).toBe('src/lib/indobase.ts');
    expect(file.content).toContain('@indobaseinc/indobase-js');
    expect(file.content).toContain('VITE_INDOBASE_URL');
    expect(file.content).not.toContain('@supabase/supabase-js');
  });
});
