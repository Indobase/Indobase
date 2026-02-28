import { generateModelMarkdown } from './model-markdown';

/**
 * A markdown generator function that takes matched parameters and returns markdown content
 */
type MarkdownGenerator = (match: RegExpMatchArray) => Promise<string | null>;

/**
 * Registry of route patterns to markdown generators
 */
const markdownGenerators = new Map<RegExp, MarkdownGenerator>();

/**
 * Register generator for model reference routes
 * Pattern: /docs/references/{version}/models/{model}
 * Example: /docs/references/cloud/models/session
 */
markdownGenerators.set(/^\/docs\/references\/([^/]+)\/models\/([^/]+)$/, async (match) => {
    const [, versionParam, modelName] = match;
    return generateModelMarkdown(versionParam, modelName);
});

/**
 * Finds and executes the appropriate markdown generator for a given route ID
 * @param routeId - The route identifier (pathname)
 * @returns Generated markdown content or null if no generator found
 */
export async function generateDynamicMarkdown(routeId: string): Promise<string | null> {
    for (const [pattern, generator] of markdownGenerators) {
        const match = routeId.match(pattern);
        if (match) {
            return await generator(match);
        }
    }
    return null;
}

/**
 * Checks if a route has a registered markdown generator
 * @param routeId - The route identifier (pathname)
 * @returns True if a generator exists for this route
 */
export function hasDynamicMarkdownGenerator(routeId: string): boolean {
    for (const pattern of markdownGenerators.keys()) {
        if (pattern.test(routeId)) {
            return true;
        }
    }
    return false;
}
