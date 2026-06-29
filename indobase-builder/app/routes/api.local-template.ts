import { json } from '@remix-run/cloudflare';
import { INDOBASE_TEMPLATE_BUNDLES } from '~/lib/indobase/indobaseTemplates';
import { readLocalTemplateBundle } from '~/lib/indobase/readLocalTemplateBundle.server';

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const bundle = url.searchParams.get('bundle')?.trim();

  if (!bundle) {
    return json({ error: 'Bundle id is required' }, { status: 400 });
  }

  if (!INDOBASE_TEMPLATE_BUNDLES.includes(bundle)) {
    return json({ error: 'Unknown template bundle' }, { status: 404 });
  }

  try {
    const files = await readLocalTemplateBundle(bundle);
    return json(files);
  } catch (error) {
    console.error('Failed to read local template bundle:', bundle, error);

    return json(
      {
        error: 'Failed to read local template bundle',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
