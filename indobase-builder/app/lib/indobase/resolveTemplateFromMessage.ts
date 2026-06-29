import { STARTER_TEMPLATES } from '~/utils/constants';

function normalizeTemplateText(value: string) {
  return value
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesTemplate(message: string, templateName: string, aliases: string[] = []) {
  const normalizedMessage = normalizeTemplateText(message);
  const candidates = [templateName, ...aliases].map(normalizeTemplateText).filter(Boolean);

  return candidates.some((candidate) => {
    if (normalizedMessage === candidate) {
      return true;
    }

    if (normalizedMessage.includes(`use the ${candidate} template`)) {
      return true;
    }

    if (normalizedMessage.includes(`use ${candidate} template`)) {
      return true;
    }

    if (normalizedMessage.includes(`start from ${candidate}`)) {
      return true;
    }

    if (normalizedMessage.includes(`template: ${candidate}`)) {
      return true;
    }

    return normalizedMessage.includes(candidate) && normalizedMessage.includes('template');
  });
}

export function resolveTemplateFromMessage(message: string) {
  const trimmed = message.trim();

  if (!trimmed) {
    return null;
  }

  for (const template of STARTER_TEMPLATES) {
    if (matchesTemplate(trimmed, template.name, template.aliases)) {
      return template;
    }

    if (matchesTemplate(trimmed, template.label, template.aliases)) {
      return template;
    }
  }

  return null;
}
