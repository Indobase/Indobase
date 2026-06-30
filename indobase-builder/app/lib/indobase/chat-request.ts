import type { Message } from 'ai';

/** Hidden follow-up after starter template import (see selectStarterTemplate userMessage). */
export function isTemplateBootstrapFollowUp(messages: Message[]): boolean {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return false;
  }

  return String(lastUser.content).includes('template import is done');
}
