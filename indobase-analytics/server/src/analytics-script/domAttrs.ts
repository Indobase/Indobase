/** Primary custom-event attribute; legacy `data-rybbit-event` still accepted. */
export function getCustomEventName(element: HTMLElement): string | null {
  return element.getAttribute("data-indobase-event") || element.getAttribute("data-rybbit-event");
}

export function hasCustomEventAttribute(element: HTMLElement): boolean {
  return element.hasAttribute("data-indobase-event") || element.hasAttribute("data-rybbit-event");
}

/** Collects data-indobase-prop-* (and legacy data-rybbit-prop-*) into a props object. */
export function extractTrackingDataAttributes(element: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name.startsWith("data-indobase-prop-")) {
      attrs[attr.name.replace("data-indobase-prop-", "")] = attr.value;
    } else if (attr.name.startsWith("data-rybbit-prop-")) {
      attrs[attr.name.replace("data-rybbit-prop-", "")] = attr.value;
    }
  }
  return attrs;
}
