import { describe, expect, it } from 'vitest';

import { sanitizeGeneratedArtifact } from './sanitizeGeneratedArtifact';

describe('sanitizeGeneratedArtifact', () => {
  it('rewrites supabase SDK, paths, and env vars in generated files', () => {
    const input = {
      filePath: '/home/project/src/lib/supabase.ts',
      content: `import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);`,
    };

    const result = sanitizeGeneratedArtifact(input.filePath, input.content);

    expect(result.filePath).toBe('/home/project/src/lib/indobase.ts');
    expect(result.content).toContain('@indobaseinc/indobase-js');
    expect(result.content).toContain('VITE_INDOBASE_URL');
    expect(result.content).toContain('export const indobase =');
  });

  it('preserves relative import depth when rewriting lib/supabase imports', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/src/pages/Home.tsx',
      `import { supabase } from '../lib/supabase';

await supabase.from('users').select('*');`,
    );

    expect(result.content).toContain("from '../lib/indobase'");
    expect(result.content).toContain("await indobase.from('users')");
  });

  it('preserves same-directory imports for ./lib/supabase', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/src/App.tsx',
      `import { supabase } from './lib/supabase';`,
    );

    expect(result.content).toContain("from './lib/indobase'");
  });
});
