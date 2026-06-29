import type { Template } from '~/types/template';

export const INDOBASE_STARTER_TEMPLATES: Template[] = [
  {
    name: 'Indobase Auth App',
    label: 'Indobase Auth App',
    description:
      'Vite + React auth starter with email login, signup, session handling, and protected dashboard wired to @indobaseinc/indobase-js',
    category: 'product',
    featured: true,
    indobaseReady: true,
    localBundle: 'indobase-auth-app',
    tags: ['auth', 'login', 'signup', 'session', 'vite', 'react', 'indobase'],
    aliases: ['auth app', 'login app', 'signup app', 'indobase auth'],
    icon: 'i-ph:shield-check',
  },
  {
    name: 'Indobase Todo App',
    label: 'Indobase Todo App',
    description:
      'Task list app with Indobase persistence, optimistic updates, and SQL migration for a todos table with row-level security',
    category: 'product',
    featured: true,
    indobaseReady: true,
    localBundle: 'indobase-todo-app',
    tags: ['todo', 'crud', 'tasks', 'database', 'vite', 'react', 'indobase'],
    aliases: ['todo app', 'task app', 'todo list', 'indobase todo'],
    icon: 'i-ph:check-square',
  },
  {
    name: 'Indobase Dashboard',
    label: 'Indobase Dashboard',
    description:
      'SaaS-style admin shell with sidebar navigation, auth gate, stats cards, and Indobase client ready for your tables',
    category: 'product',
    featured: true,
    indobaseReady: true,
    localBundle: 'indobase-dashboard',
    tags: ['dashboard', 'admin', 'saas', 'analytics', 'vite', 'react', 'indobase'],
    aliases: ['admin dashboard', 'saas dashboard', 'indobase dashboard', 'internal tool'],
    icon: 'i-ph:squares-four',
  },
  {
    name: 'Indobase Marketing Site',
    label: 'Indobase Marketing Site',
    description:
      'Production landing page with hero, features, pricing, FAQ, and waitlist form that inserts into an Indobase waitlist table',
    category: 'product',
    featured: true,
    indobaseReady: true,
    localBundle: 'indobase-marketing',
    tags: ['landing', 'marketing', 'waitlist', 'pricing', 'vite', 'react', 'indobase'],
    aliases: ['marketing site', 'landing page', 'waitlist', 'indobase marketing'],
    icon: 'i-ph:megaphone',
  },
];

export const INDOBASE_TEMPLATE_BUNDLES = INDOBASE_STARTER_TEMPLATES.map((template) => template.localBundle).filter(
  Boolean,
) as string[];
