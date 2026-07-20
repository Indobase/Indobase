import MarkdownIt from 'markdown-it';

import { DEFAULT_HOST } from './metadata';

const md = new MarkdownIt('commonmark');
export function parse(content: string): string {
    const env = {};

    const tokens = md.parse(content, env);
    return md.renderer.render(
        transform_tokens(tokens),
        {
            highlight: null
        },
        env
    );
}

function transform_tokens(tokens: ReturnType<typeof md.parse>): ReturnType<typeof md.parse> {
    return tokens.map((token) => {
        if (token.children) {
            token.children = transform_tokens(token.children);
        }
        switch (token.type) {
            case 'paragraph_open':
                token.attrPush(['class', 'text-paragraph']);
                break;
            case 'link_open': {
                const href = token.attrGet('href');
                if (href?.startsWith('http')) {
                    // Our own links stay in-tab; everything else opens externally.
                    if (!href.startsWith(DEFAULT_HOST)) {
                        token.attrPush(['rel', 'noopener noreferrer']);
                        token.attrPush(['target', '_blank']);
                    }
                }
                token.attrPush(['class', 'web-link']);
                break;
            }
        }
        return token;
    });
}
