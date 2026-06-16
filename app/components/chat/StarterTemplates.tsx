import React, { useMemo, useState } from 'react';
import type { Template } from '~/types/template';
import { STARTER_TEMPLATES } from '~/utils/constants';

interface FrameworkLinkProps {
  template: Template;
}

const FrameworkLink: React.FC<FrameworkLinkProps> = ({ template }) => (
  <a
    href={`/git?url=https://github.com/${template.githubRepo}.git`}
    data-state="closed"
    data-discover="true"
    className="inline-flex items-center gap-2 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm text-bolt-elements-textPrimary transition-all duration-200 hover:border-[#FFC107]/40 hover:bg-bolt-elements-background-depth-2"
  >
    <div
      className={`inline-block ${template.icon} h-5 w-5 text-lg text-bolt-elements-textSecondary transition-theme`}
      title={template.label}
    />
    <span className="font-medium">{template.label}</span>
  </a>
);

const CATEGORY_SECTIONS: Array<{
  key: NonNullable<Template['category']>;
  title: string;
  description: string;
}> = [
  {
    key: 'product',
    title: 'Product starters',
    description: 'Production-shaped apps for SaaS, commerce, dashboards, and launches.',
  },
  {
    key: 'content',
    title: 'Content starters',
    description: 'Docs, blogs, and presentation-focused foundations.',
  },
  {
    key: 'mobile',
    title: 'Mobile starters',
    description: 'Cross-platform app foundations for mobile builds.',
  },
  {
    key: 'framework',
    title: 'Framework foundations',
    description: 'Lower-level stacks when you want to choose the framework yourself.',
  },
];

const StarterTemplates: React.FC = () => {
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const featuredTemplates = useMemo(() => STARTER_TEMPLATES.filter((template) => template.featured).slice(0, 6), []);
  const groupedTemplates = CATEGORY_SECTIONS.map((section) => ({
    ...section,
    templates: STARTER_TEMPLATES.filter((template) => template.category === section.key),
  })).filter((section) => section.templates.length > 0);

  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-[0.18em] text-bolt-elements-textSecondary">
        Start from a proven product
      </div>
      <p className="mt-2 text-sm text-bolt-elements-textSecondary">
        Start with an Indobase-ready app shape, then refine the experience with Builder.
      </p>

      {featuredTemplates.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-[#FFC107]/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[#FFC107]">
              Featured
            </span>
            <span className="text-xs text-bolt-elements-textSecondary">Best first picks for most product requests</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {featuredTemplates.map((template) => (
              <FrameworkLink key={template.name} template={template} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-bolt-elements-textSecondary">
          More docs, blog, mobile, and framework foundations can still be matched from your prompt.
        </p>
        <button
          type="button"
          onClick={() => setShowAllTemplates((current) => !current)}
          className="shrink-0 rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs font-medium text-bolt-elements-textPrimary transition-all duration-200 hover:border-[#FFC107]/40 hover:bg-bolt-elements-background-depth-2"
        >
          {showAllTemplates ? 'Show fewer starters' : 'Browse all starters'}
        </button>
      </div>

      {showAllTemplates && (
        <div className="mt-5 space-y-5">
          {groupedTemplates.map((section) => (
            <div key={section.key}>
              <div className="text-xs font-medium uppercase tracking-[0.16em] text-bolt-elements-textSecondary">
                {section.title}
              </div>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">{section.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {section.templates.map((template) => (
                  <FrameworkLink key={template.name} template={template} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StarterTemplates;
