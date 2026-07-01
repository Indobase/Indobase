import ignore from 'ignore';
import type { ProviderInfo } from '~/types/model';
import { getBuilderRequestInit } from '~/lib/indobase/builder-auth.client';
import { CURATED_BOILERPLATES, INDOBASE_ADAPTATION_PROMPT } from '~/lib/indobase/curatedBoilerplates';
import { INDOBASE_STARTER_TEMPLATES } from '~/lib/indobase/indobaseTemplates';
import { rebrandTemplateBundleForIndobase } from '~/lib/indobase/rebrandTemplateBundle';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from './constants';

const TEMPLATE_CATEGORY_PRIORITY: Record<NonNullable<Template['category']>, number> = {
  product: 0,
  content: 1,
  mobile: 2,
  framework: 3,
};

const sortTemplatesForSelection = (templates: Template[]) =>
  [...templates].sort((left, right) => {
    const featuredDelta = Number(right.featured ?? false) - Number(left.featured ?? false);

    if (featuredDelta !== 0) {
      return featuredDelta;
    }

    const leftPriority = TEMPLATE_CATEGORY_PRIORITY[left.category ?? 'framework'];
    const rightPriority = TEMPLATE_CATEGORY_PRIORITY[right.category ?? 'framework'];

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.label.localeCompare(right.label);
  });

const starterTemplateSelectionPrompt = (templates: Template[]) => `
You are an experienced developer who helps people choose the best starter template for their projects.
IMPORTANT: Vite is preferred
IMPORTANT: Only choose shadcn templates if the user explicitly asks for shadcn.
IMPORTANT: Prefer featured, product-ready templates for real products unless the user explicitly asks for a specific framework or lower-level starter.
IMPORTANT: When the user mentions Indobase, auth, database, backend, waitlist, todos, dashboard, or publishing to Indobase, prefer the Indobase-ready templates first.
IMPORTANT: Prefer content starters for blogs, docs, publishing, and marketing sites.
IMPORTANT: For mobile apps (Expo/React Native), prefer Expo Auth NativeWind or Expo Production Kit before generic framework starters.
IMPORTANT: For auth-heavy web apps, prefer Indobase Auth App or React Supabase Auth community boilerplates.

Available templates:
<template>
  <name>blank</name>
  <description>Empty starter for simple scripts and trivial tasks that don't require a full template setup</description>
  <category>foundation</category>
  <tags>basic, script</tags>
</template>
${templates
  .map(
    (template) => `
<template>
  <name>${template.name}</name>
  <description>${template.description}</description>
  ${template.category ? `<category>${template.category}</category>` : ''}
  <featured>${template.featured ? 'true' : 'false'}</featured>
  ${template.tags ? `<tags>${template.tags.join(', ')}</tags>` : ''}
</template>
`,
  )
  .join('\n')}

Response Format:
<selection>
  <templateName>{selected template name}</templateName>
  <title>{a proper title for the project}</title>
</selection>

Examples:

<example>
User: I need to build a todo app
Response:
<selection>
  <templateName>Vite React</templateName>
  <title>Simple React todo application</title>
</selection>
</example>

<example>
User: Write a script to generate numbers from 1 to 100
Response:
<selection>
  <templateName>blank</templateName>
  <title>script to generate numbers from 1 to 100</title>
</selection>
</example>

Instructions:
1. For trivial tasks and simple scripts, always recommend the blank template
2. For real products, prefer featured product templates before generic framework starters
3. Only choose framework starters when the user explicitly names a framework or needs a bare foundation
4. For docs, blogs, knowledge bases, and marketing sites, prefer content templates
5. Follow the exact XML format
6. Consider technical requirements, category, and tags
7. If no perfect match exists, recommend the closest option

Important: Provide only the selection tags in your response, no additional text.
MOST IMPORTANT: YOU DONT HAVE TIME TO THINK JUST START RESPONDING BASED ON HUNCH 
`;

const templates: Template[] = sortTemplatesForSelection(
  STARTER_TEMPLATES.filter((t) => !t.name.toLowerCase().includes('shadcn')),
);

const parseSelectedTemplate = (llmOutput: string): { template: string; title: string } | null => {
  try {
    // Extract content between <templateName> tags
    const templateNameMatch = llmOutput.match(/<templateName>(.*?)<\/templateName>/);
    const titleMatch = llmOutput.match(/<title>(.*?)<\/title>/);

    if (!templateNameMatch) {
      return null;
    }

    return { template: templateNameMatch[1].trim(), title: titleMatch?.[1].trim() || 'Untitled Project' };
  } catch (error) {
    console.error('Error parsing template selection:', error);
    return null;
  }
};

export const selectStarterTemplate = async (options: {
  message: string;
  model: string;
  provider: ProviderInfo;
  preferIndobase?: boolean;
}) => {
  const { message, model, provider, preferIndobase = false } = options;
  const availableTemplates = preferIndobase
    ? sortTemplatesForSelection([
        ...INDOBASE_STARTER_TEMPLATES,
        ...STARTER_TEMPLATES.filter((template) => !template.indobaseReady),
      ])
    : templates;
  const requestBody = {
    message,
    model,
    provider,
    system: starterTemplateSelectionPrompt(availableTemplates),
  };
  const response = await fetch(
    '/api/llmcall',
    getBuilderRequestInit({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    }),
  );
  const respJson: { text: string } = await response.json();
  console.log(respJson);

  const { text } = respJson;
  const selectedTemplate = parseSelectedTemplate(text);

  if (selectedTemplate) {
    return selectedTemplate;
  } else {
    console.log('No template selected, using blank template');

    return {
      template: 'blank',
      title: '',
    };
  }
};

const getLocalTemplateContent = async (bundleId: string) => {
  const response = await fetch(`/api/local-template?bundle=${encodeURIComponent(bundleId)}`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return (await response.json()) as { name: string; path: string; content: string }[];
};

const getGitHubRepoContent = async (repoName: string): Promise<{ name: string; path: string; content: string }[]> => {
  try {
    // Instead of directly fetching from GitHub, use our own API endpoint as a proxy
    const response = await fetch(`/api/github-template?repo=${encodeURIComponent(repoName)}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Our API will return the files in the format we need
    const files = (await response.json()) as any;

    return files;
  } catch (error) {
    console.error('Error fetching release contents:', error);
    throw error;
  }
};

export async function getTemplates(templateName: string, title?: string) {
  const template = STARTER_TEMPLATES.find((t) => t.name == templateName);

  if (!template) {
    return null;
  }

  const files = template.localBundle
    ? await getLocalTemplateContent(template.localBundle)
    : await getGitHubRepoContent(template.githubRepo!);

  let filteredFiles = template.indobaseAdaptable ? rebrandTemplateBundleForIndobase(files) : files;

  /*
   * ignoring common unwanted files
   * exclude    .git
   */
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.git') == false);

  /*
   * exclude    lock files
   * WE NOW INCLUDE LOCK FILES FOR IMPROVED INSTALL TIMES
   */
  {
    /*
     *const comminLockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
     *filteredFiles = filteredFiles.filter((x) => comminLockFiles.includes(x.name) == false);
     */
  }

  // exclude    .bolt
  filteredFiles = filteredFiles.filter((x) => x.path.startsWith('.bolt') == false);

  // check for ignore file in .bolt folder
  const templateIgnoreFile = files.find((x) => x.path.startsWith('.bolt') && x.name == 'ignore');

  const filesToImport = {
    files: filteredFiles,
    ignoreFile: [] as typeof filteredFiles,
  };

  if (templateIgnoreFile) {
    // redacting files specified in ignore file
    const ignorepatterns = templateIgnoreFile.content.split('\n').map((x) => x.trim());
    const ig = ignore().add(ignorepatterns);

    // filteredFiles = filteredFiles.filter(x => !ig.ignores(x.path))
    const ignoredFiles = filteredFiles.filter((x) => ig.ignores(x.path));

    filesToImport.files = filteredFiles;
    filesToImport.ignoreFile = ignoredFiles;
  }

  const hasPackageJson = filesToImport.files.some(
    (file) => file.path === 'package.json' || file.name === 'package.json',
  );

  const templateBootstrapShellActions = hasPackageJson
    ? `<boltAction type="shell">npm install --no-audit --no-fund --yes --include=dev</boltAction>
<boltAction type="start">npm run dev</boltAction>
`
    : '';

  const assistantMessage = `
Indobase Builder is initializing your project with the required files using the ${template.name} template.
<boltArtifact id="imported-files" title="${title || 'Create initial files'}" type="bundled">
${filesToImport.files
  .map(
    (file) =>
      `<boltAction type="file" filePath="${file.path}">
${file.content}
</boltAction>`,
  )
  .join('\n')}
${templateBootstrapShellActions}</boltArtifact>
`;
  let userMessage = ``;
  const templatePromptFile = files.filter((x) => x.path.startsWith('.bolt')).find((x) => x.name == 'prompt');

  if (templatePromptFile) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${templatePromptFile.content}

---
`;
  } else if (template.indobaseAdaptable) {
    userMessage = `
TEMPLATE INSTRUCTIONS:
${INDOBASE_ADAPTATION_PROMPT}

---
`;
  }

  if (filesToImport.ignoreFile.length > 0) {
    userMessage =
      userMessage +
      `
STRICT FILE ACCESS RULES - READ CAREFULLY:

The following files are READ-ONLY and must never be modified:
${filesToImport.ignoreFile.map((file) => `- ${file.path}`).join('\n')}

Permitted actions:
✓ Import these files as dependencies
✓ Read from these files
✓ Reference these files

Strictly forbidden actions:
❌ Modify any content within these files
❌ Delete these files
❌ Rename these files
❌ Move these files
❌ Create new versions of these files
❌ Suggest changes to these files

Any attempt to modify these protected files will result in immediate termination of the operation.

If you need to make changes to functionality, create new files instead of modifying the protected ones listed above.
---
`;
  }

  userMessage += `
---
template import is done, and you can now use the imported files,
edit only the files that need to be changed, and you can create new files as needed.
NO NOT EDIT/WRITE ANY FILES THAT ALREADY EXIST IN THE PROJECT AND DOES NOT NEED TO BE MODIFIED
---
Now that the Template is imported please continue with my original request

IMPORTANT: Dont Forget to install the dependencies before running the app by using \`npm install && npm run dev\`
`;

  return {
    assistantMessage,
    userMessage,
  };
}
