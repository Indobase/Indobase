/**
 * Shared blog content types for Markdoc layouts and metadata helpers.
 * Route loaders populate these shapes via Svelte context at runtime.
 */
export type AuthorData = {
	slug: string;
	name: string;
	href: string;
	avatar?: string;
	role?: string;
};

export type PostsData = {
	title: string;
	href: string;
	cover: string;
	date: string;
	timeToRead: string;
	author: string | string[];
	category: string | string[];
	unlisted?: boolean;
	draft?: boolean;
	lastUpdated?: string;
};
