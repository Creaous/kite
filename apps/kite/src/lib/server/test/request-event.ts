type RequestEventOptions = {
	method: string;
	path: string;
	body?: unknown;
	params?: Record<string, string>;
	headers?: Record<string, string>;
	authenticated?: boolean;
};

export function createRequestEvent(options: RequestEventOptions) {
	const headers = new Headers(options.headers ?? {});
	const hasBody = options.body !== undefined;

	let body: BodyInit | undefined;
	if (hasBody) {
		if (
			options.body instanceof ArrayBuffer ||
			ArrayBuffer.isView(options.body) ||
			typeof options.body === 'string'
		) {
			body = options.body as BodyInit;
		} else {
			if (!headers.has('content-type')) {
				headers.set('content-type', 'application/json');
			}
			body = JSON.stringify(options.body);
		}
	}

	const request = new Request(`http://localhost${options.path}`, {
		method: options.method,
		headers,
		body
	});

	const locals = options.authenticated
		? ({
				user: {
					id: 'test-user-id',
					email: 'test@example.com',
					name: 'Test User',
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
					role: 'admin'
				},
				session: {
					id: 'test-session-id',
					userId: 'test-user-id',
					token: 'test-token',
					expiresAt: new Date(Date.now() + 60 * 60 * 1000),
					createdAt: new Date(),
					updatedAt: new Date(),
					ipAddress: '127.0.0.1',
					userAgent: 'vitest'
				}
			} as App.Locals)
		: {};

	return {
		request,
		params: options.params ?? {},
		url: new URL(request.url),
		locals,
		platform: undefined,
		route: { id: null },
		cookies: {
			get: () => undefined,
			set: () => undefined,
			delete: () => undefined,
			serialize: () => '',
			getAll: () => []
		},
		setHeaders: () => undefined,
		getClientAddress: () => '127.0.0.1',
		isDataRequest: false,
		isSubRequest: false,
		fetch
	} as never;
}
