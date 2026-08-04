import { describe, expect, it } from 'vitest';

import {
  normalizeGeneratedFilePath,
  resolveGeneratedFileArtifact,
  sanitizeFileAction,
  sanitizeGeneratedArtifact,
  shouldRejectGeneratedPath,
} from './sanitizeGeneratedArtifact';

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

    expect(result.filePath).toBe('src/lib/indobase.ts');
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

  it('extracts embedded filePath metadata and strips contentType wrappers', () => {
    const result = resolveGeneratedFileArtifact(
      '/untitled-1782682832716.txt',
      `<filePath>/home/project/src/pages/Register.jsx</filePath>
<contentType>application/javascript</contentType>
import React from 'react';

export default function Register() {
  return null;
}
`,
    );

    expect(result.filePath).toBe('src/pages/Register.jsx');
    expect(result.content).not.toContain('<filePath>');
    expect(result.content).not.toContain('<contentType>');
    expect(result.content).toContain('export default function Register');
  });

  it('infers package.json when placeholder path contains manifest content', () => {
    const result = resolveGeneratedFileArtifact(
      '/untitled-123.txt',
      `{
  "name": "demo",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}`,
    );

    expect(result.filePath).toBe('package.json');
  });

  it('coerces hallucinated @indobaseinc package versions to published ones', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/package.json',
      `{
  "dependencies": {
    "@supabase/supabase-js": "^2.49.1",
    "react": "^18.3.1"
  }
}`,
    );

    expect(result.content).toContain('"@indobaseinc/indobase-js": "^1.0.8"');
    expect(result.content).not.toContain('2.49.1');
    expect(result.content).toContain('"react": "^18.3.1"');
  });

  it('coerces versions when the model already emits @indobaseinc with a bad version', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/package.json',
      `{
  "dependencies": {
    "@indobaseinc/indobase-js": "^2.49.1",
    "@indobaseinc/ssr": "^0.5.0"
  }
}`,
    );

    expect(result.content).toContain('"@indobaseinc/indobase-js": "^1.0.8"');
    expect(result.content).toContain('"@indobaseinc/ssr": "^0.12.0"');
  });

  it('coerces npm install commands with bad versions', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/setup.sh',
      'npm install @supabase/supabase-js@^2.49.1 react',
    );

    expect(result.content).toContain('@indobaseinc/indobase-js@^1.0.8');
    expect(result.content).not.toContain('2.49.1');
  });

  it('strips stray HTML style tags from CSS files that break PostCSS', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/src/index.css',
      `@tailwind base;\n.foo { color: red; }\n</style>\n`,
    );

    expect(result.content).toContain('@tailwind base');
    expect(result.content).toContain('.foo { color: red; }');
    expect(result.content).not.toContain('</style>');
  });

  it('strips leaked bolt markup from file bodies and closes truncated delimiters', () => {
    const result = sanitizeGeneratedArtifact(
      '/home/project/src/components/Footer.tsx',
      `export default function Footer() {
  return (
    <motion.footer
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: 0<boltArtifact id="1" title="x">
<boltAction type="file" filePath="src/components/Footer.tsx">
import { motion } from 'framer-motion';
`,
    );

    expect(result.content).not.toContain('<boltArtifact');
    expect(result.content).not.toContain('<boltAction');
    expect(result.content).toContain('viewport={{ once: true }}');
    expect(result.content.trim().endsWith('}')).toBe(true);
  });

  it('resolves .. segments inside the project instead of emitting .._ corruption', () => {
    expect(normalizeGeneratedFilePath('/home/project/src/../main.tsx')).toBe('main.tsx');
    expect(normalizeGeneratedFilePath('src/../App.tsx')).toBe('App.tsx');
    expect(normalizeGeneratedFilePath('../outside.tsx')).toBe('outside.tsx');
  });

  it('rejects AppleDouble, .._ corruption, and PDF import leakage', () => {
    expect(shouldRejectGeneratedPath('src/._main.tsx')).toBe(true);
    expect(shouldRejectGeneratedPath('._package-lock.json')).toBe(true);
    expect(shouldRejectGeneratedPath('src/.._main.tsx')).toBe(true);
    expect(
      shouldRejectGeneratedPath(
        'src/imports/GreenFuturz__AI-Driven_Web_Application_Development_proposal_02_02_2026.pdf',
      ),
    ).toBe(true);
    expect(shouldRejectGeneratedPath('src/App.tsx')).toBe(false);
  });

  it('sanitizeFileAction returns null for rejected paths', () => {
    expect(
      sanitizeFileAction({
        type: 'file',
        filePath: 'src/imports/proposal.pdf',
        content: '%PDF-1.4',
      }),
    ).toBeNull();

    expect(
      sanitizeFileAction({
        type: 'file',
        filePath: 'src/App.tsx',
        content: 'export default function App() { return null }',
      }),
    ).toMatchObject({ filePath: 'src/App.tsx' });
  });
});
