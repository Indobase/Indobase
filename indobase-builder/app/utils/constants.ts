import { LLMManager } from '~/lib/modules/llm/manager';
import { INDOBASE_STARTER_TEMPLATES } from '~/lib/indobase/indobaseTemplates';
import { CURATED_BOILERPLATES } from '~/lib/indobase/curatedBoilerplates';
import {
  DEFAULT_OPENROUTER_CODING_MODEL,
  OPENROUTER_FREE_VISION_MODEL,
} from '~/lib/indobase/openrouter-coding-models';
import type { Template } from '~/types/template';

export const WORK_DIR_NAME = 'project';
export const WORK_DIR = `/home/${WORK_DIR_NAME}`;
export const MODIFICATIONS_TAG_NAME = 'bolt_file_modifications';
export const MODEL_REGEX = /^\[Model: (.*?)\]\n\n/;
export const PROVIDER_REGEX = /\[Provider: (.*?)\]\n\n/;
/**
 * Studio backend instructions + the project's live schema, injected into the user message for the
 * model. Stripped before rendering so the transcript shows what the user typed — see
 * `wrapStudioContext` in ~/lib/indobase/studio-database-prompt.
 */
export const STUDIO_CONTEXT_REGEX = /<indobase_studio_context>[\s\S]*?<\/indobase_studio_context>\n*/g;
/** Default discuss/chat model — OpenRouter free tier (Build codegen uses Inkling server-side). */
export const DEFAULT_MODEL = DEFAULT_OPENROUTER_CODING_MODEL;
/** OpenRouter free vision model when the user attaches screenshots/images. */
export const VISION_MODEL = OPENROUTER_FREE_VISION_MODEL.name;
export const FIXED_MODEL_PROVIDER_NAME = 'OpenRouter';
export const PROMPT_COOKIE_KEY = 'cachedPrompt';
export const TOOL_EXECUTION_APPROVAL = {
  APPROVE: 'Yes, approved.',
  REJECT: 'No, rejected.',
} as const;
export const TOOL_NO_EXECUTE_FUNCTION = 'Error: No execute function found on tool';
export const TOOL_EXECUTION_DENIED = 'Error: User denied access to tool execution';
export const TOOL_EXECUTION_ERROR = 'Error: An error occured while calling tool';

const llmManager = LLMManager.getInstance(import.meta.env);

export const PROVIDER_LIST = llmManager.getAllProviders();
// Default to OpenRouter — configured API key + default models are OpenRouter-hosted.
export const DEFAULT_PROVIDER =
  PROVIDER_LIST.find((provider) => provider.name === 'OpenRouter') ?? llmManager.getDefaultProvider();
/** Chat is OpenRouter free models only (platform key). */
export const ALLOWED_CHAT_PROVIDER_NAMES = ['OpenRouter'] as const;

export const providerBaseUrlEnvKeys: Record<string, { baseUrlKey?: string; apiTokenKey?: string }> = {};
PROVIDER_LIST.forEach((provider) => {
  providerBaseUrlEnvKeys[provider.name] = {
    baseUrlKey: provider.config.baseUrlKey,
    apiTokenKey: provider.config.apiTokenKey,
  };
});

// starter Templates

export const STARTER_TEMPLATES: Template[] = [
  ...INDOBASE_STARTER_TEMPLATES,
  ...CURATED_BOILERPLATES,
  {
    name: 'AI Chatbot',
    label: 'AI Chatbot',
    description:
      'Next.js AI chatbot boilerplate with authentication, persistence, streaming responses, and modern chat UX',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/ai-chatbot',
    tags: ['ai', 'chatbot', 'llm', 'nextjs', 'auth', 'database', 'assistant'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'SaaS Billing',
    label: 'Next.js SaaS Billing',
    description:
      'Production-style SaaS starter with auth, subscriptions, billing flows, gated routes, and account management',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/nextjs-subscription-payments',
    tags: ['saas', 'billing', 'subscriptions', 'payments', 'nextjs', 'auth', 'dashboard'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Commerce Storefront',
    label: 'Next.js Commerce',
    description:
      'Modern ecommerce storefront boilerplate with collections, product pages, cart, and checkout foundations',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/commerce',
    tags: ['ecommerce', 'storefront', 'shop', 'commerce', 'nextjs', 'cart', 'catalog'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Admin Dashboard',
    label: 'Admin Dashboard',
    description:
      'Full-stack Next.js dashboard starter with auth, Postgres integration, protected pages, and management UI',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/nextjs-postgres-nextauth-tailwindcss-template',
    tags: ['admin', 'dashboard', 'internal-tool', 'nextjs', 'postgres', 'auth', 'management'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Product Landing Page',
    label: 'Product Landing Page',
    description:
      'High-quality Next.js marketing and portfolio boilerplate for landing pages, launches, and product websites',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/nextjs-portfolio-starter',
    tags: ['landing-page', 'marketing', 'portfolio', 'website', 'nextjs', 'brand', 'launch'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Platform Starter Kit',
    label: 'Multi-tenant Platform',
    description:
      'Multi-tenant Next.js platform starter for SaaS products, team workspaces, partner portals, and marketplace-style apps',
    category: 'product',
    featured: true,
    githubRepo: 'vercel/platforms',
    tags: ['platform', 'multi-tenant', 'saas', 'marketplace', 'workspace', 'teams', 'nextjs'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Analytics Dashboard',
    label: 'Analytics Dashboard',
    description:
      'Data-rich dashboard starter for analytics products, internal reporting tools, KPI tracking, and operational consoles',
    category: 'product',
    githubRepo: 'tremorlabs/template-dashboard',
    tags: ['analytics', 'dashboard', 'charts', 'reporting', 'internal-tool', 'admin', 'react'],
    icon: 'i-bolt:react',
  },
  {
    name: 'Enterprise SaaS Kit',
    label: 'Enterprise SaaS',
    description:
      'Enterprise-oriented SaaS boilerplate with auth, organizations, billing, permissions, and full-stack product foundations',
    category: 'product',
    githubRepo: 'boxyhq/saas-starter-kit',
    tags: ['enterprise', 'saas', 'b2b', 'organizations', 'auth', 'billing', 'nextjs'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Full-Stack SaaS',
    label: 'Full-Stack SaaS Platform',
    description:
      'Full-stack multi-tenant SaaS starter focused on shipping product features quickly with payments, data models, and app scaffolding',
    category: 'product',
    githubRepo: 'nextacular/nextacular',
    tags: ['saas', 'fullstack', 'multi-tenant', 'prisma', 'stripe', 'nextjs', 'platform'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Startup SaaS Boilerplate',
    label: 'Startup SaaS Boilerplate',
    description:
      'Modern startup-ready SaaS boilerplate for fast launches with auth, onboarding, data, and growth-focused app structure',
    category: 'product',
    githubRepo: 'saasfly/saasfly',
    tags: ['startup', 'saas', 'launch', 'boilerplate', 'growth', 'nextjs', 'product'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Docs Site',
    label: 'Documentation Site',
    description:
      'Astro documentation starter for product docs, knowledge bases, developer guides, and structured content sites',
    category: 'content',
    featured: true,
    githubRepo: 'withastro/starlight',
    tags: ['docs', 'documentation', 'knowledge-base', 'guides', 'astro', 'content'],
    icon: 'i-bolt:astro',
  },
  {
    name: 'Blog Publisher',
    label: 'Blog & Content Site',
    description:
      'Technical writing and publishing boilerplate for blogs, changelogs, product content, and documentation-driven websites',
    category: 'content',
    githubRepo: 'timlrx/tailwind-nextjs-starter-blog',
    tags: ['blog', 'publishing', 'content', 'mdx', 'marketing', 'seo', 'nextjs'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Basic Astro',
    label: 'Astro Basic',
    description: 'Lightweight Astro starter template for building fast static websites',
    category: 'content',
    githubRepo: 'xKevIsDev/bolt-astro-basic-template',
    tags: ['astro', 'blog', 'performance'],
    icon: 'i-bolt:astro',
  },
  {
    name: 'Slidev',
    label: 'Slidev Presentation',
    description: 'Slidev starter template for creating developer-friendly presentations using Markdown',
    category: 'content',
    githubRepo: 'xKevIsDev/bolt-slidev-template',
    tags: ['slidev', 'presentation', 'markdown'],
    icon: 'i-bolt:slidev',
  },
  {
    name: 'Expo App',
    label: 'Expo App',
    description: 'Expo starter template for building cross-platform mobile apps',
    category: 'mobile',
    featured: true,
    githubRepo: 'xKevIsDev/bolt-expo-template',
    tags: ['mobile', 'expo', 'mobile-app', 'android', 'iphone'],
    icon: 'i-bolt:expo',
  },
  {
    name: 'NextJS Shadcn',
    label: 'Next.js with shadcn/ui',
    description: 'Next.js starter fullstack template integrated with shadcn/ui components and styling system',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-nextjs-shadcn-template',
    tags: ['nextjs', 'react', 'typescript', 'shadcn', 'tailwind'],
    icon: 'i-bolt:nextjs',
  },
  {
    name: 'Vite Shadcn',
    label: 'Vite with shadcn/ui',
    description: 'Vite starter fullstack template integrated with shadcn/ui components and styling system',
    category: 'framework',
    githubRepo: 'xKevIsDev/vite-shadcn',
    tags: ['vite', 'react', 'typescript', 'shadcn', 'tailwind'],
    icon: 'i-bolt:shadcn',
  },
  {
    name: 'Vite React',
    label: 'React + Vite + typescript',
    description: 'React starter template powered by Vite for fast development experience',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-vite-react-ts-template',
    tags: ['react', 'vite', 'frontend', 'website', 'app'],
    icon: 'i-bolt:react',
  },
  {
    name: 'Remix Typescript',
    label: 'Remix TypeScript',
    description: 'Remix framework starter with TypeScript for full-stack web applications',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-remix-ts-template',
    tags: ['remix', 'typescript', 'fullstack', 'react'],
    icon: 'i-bolt:remix',
  },
  {
    name: 'Sveltekit',
    label: 'SvelteKit',
    description: 'SvelteKit starter template for building fast, efficient web applications',
    category: 'framework',
    githubRepo: 'bolt-sveltekit-template',
    tags: ['svelte', 'sveltekit', 'typescript'],
    icon: 'i-bolt:svelte',
  },
  {
    name: 'Vue',
    label: 'Vue.js',
    description: 'Vue.js starter template with modern tooling and best practices',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-vue-template',
    tags: ['vue', 'typescript', 'frontend'],
    icon: 'i-bolt:vue',
  },
  {
    name: 'Angular',
    label: 'Angular Starter',
    description: 'A modern Angular starter template with TypeScript support and best practices configuration',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-angular-template',
    tags: ['angular', 'typescript', 'frontend', 'spa'],
    icon: 'i-bolt:angular',
  },
  {
    name: 'Qwik Typescript',
    label: 'Qwik TypeScript',
    description: 'Qwik framework starter with TypeScript for building resumable applications',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-qwik-ts-template',
    tags: ['qwik', 'typescript', 'performance', 'resumable'],
    icon: 'i-bolt:qwik',
  },
  {
    name: 'SolidJS',
    label: 'SolidJS Tailwind',
    description: 'Lightweight SolidJS starter template for building fast static websites',
    category: 'framework',
    githubRepo: 'xKevIsDev/solidjs-ts-tw',
    tags: ['solidjs'],
    icon: 'i-bolt:solidjs',
  },
  {
    name: 'Vite Typescript',
    label: 'Vite + TypeScript',
    description: 'Vite starter template with TypeScript configuration for type-safe development',
    category: 'framework',
    githubRepo: 'xKevIsDev/bolt-vite-ts-template',
    tags: ['vite', 'typescript', 'minimal'],
    icon: 'i-bolt:typescript',
  },
  {
    name: 'Vanilla Vite',
    label: 'Vanilla + Vite',
    description: 'Minimal Vite starter template for vanilla JavaScript projects',
    category: 'framework',
    githubRepo: 'xKevIsDev/vanilla-vite-template',
    tags: ['vite', 'vanilla-js', 'minimal'],
    icon: 'i-bolt:vite',
  },
];
