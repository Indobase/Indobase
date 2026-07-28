/**
 * Docs reference spec types and loader stub.
 * Full OpenAPI-backed specs were removed from the marketing site tree; keep the
 * module so server helpers and typecheck stay stable until specs are reintroduced.
 */
export type SDKMethod = {
	title: string;
	description?: string;
	method: string;
	url: string;
	group?: string;
	parameters: Array<{
		name: string;
		type: string;
		required?: boolean;
		description?: string;
	}>;
	responses: Array<{
		code: string | number;
		contentType?: string;
		models?: Array<{ name: string; id: string }>;
	}>;
	'rate-limit': number;
	'rate-time': number;
	demo?: string;
};

export type ServiceSpec = {
	service: {
		name: string;
		description?: string;
	};
	methods: SDKMethod[];
};

export async function getService(
	_version: string,
	_platform: string,
	serviceName: string
): Promise<ServiceSpec> {
	return {
		service: { name: serviceName },
		methods: []
	};
}
