import React from 'react';

const EXAMPLE_PROMPTS = [
  {
    title: 'SaaS Dashboard',
    description: 'Admin panels, analytics, auth flows, and subscription UX.',
    text: 'Build a SaaS dashboard with authentication, analytics charts, settings, and billing screens connected to my Indobase backend.',
  },
  {
    title: 'Customer Portal',
    description: 'A polished product surface for users and teams.',
    text: 'Create a customer portal with onboarding, team management, notifications, and a clean responsive UI.',
  },
  {
    title: 'Marketing Site',
    description: 'Launch pages with strong copy, sections, and CTAs.',
    text: 'Design a modern landing page with pricing, testimonials, FAQs, and a waitlist form for an AI startup.',
  },
  {
    title: 'Internal Tool',
    description: 'CRUD workflows, search, filters, and table-heavy screens.',
    text: 'Build an internal operations tool with searchable tables, task management, audit logs, and role-based access.',
  },
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative grid w-full gap-3 sm:grid-cols-2">
      <div
        className="contents"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.text);
              }}
              className="group relative overflow-hidden rounded-2xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-left transition-all duration-200 hover:border-[#FFC107]/40 hover:bg-bolt-elements-background-depth-2"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#FFC107]/6 via-transparent to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-3">
                <div className="relative">
                  <div className="text-sm font-medium text-bolt-elements-textPrimary">{examplePrompt.title}</div>
                  <div className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
                    {examplePrompt.description}
                  </div>
                </div>
                <div className="relative i-ph:arrow-up-right text-base text-bolt-elements-textSecondary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
