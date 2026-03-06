import { afterEach, describe, expect, it, vi } from 'vitest';

const { getAuthSettingsMock, authGetSessionMock, svelteKitHandlerMock, authHandlerMock } =
	vi.hoisted(() => ({
		getAuthSettingsMock: vi.fn(),
		authGetSessionMock: vi.fn(async () => null),
		svelteKitHandlerMock: vi.fn(({ event, resolve }) => resolve(event)),
		authHandlerMock: vi.fn(async () => new Response('auth-handler-ok'))
	}));

vi.mock('$lib/server/services/settings', () => ({
	getAuthSettings: getAuthSettingsMock
}));

vi.mock('$lib/server/auth', () => ({
	auth: {
		handler: authHandlerMock,
		api: {
			getSession: authGetSessionMock
		}
	}
}));

vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: svelteKitHandlerMock
}));

vi.mock('$lib/paraglide/server', () => ({
	paraglideMiddleware: (
		request: Request,
		callback: (args: { request: Request; locale: string }) => unknown
	) => {
		return callback({ request, locale: 'en' });
	}
}));

import { handlePublicApiAvailability as handle } from './hooks.server';

function createEvent(pathname: string, isSubRequest = false) {
	const request = new Request(`http://localhost${pathname}`);
	return {
		request,
		url: new URL(request.url),
		isSubRequest,
		locals: {},
		platform: undefined,
		route: { id: null },
		cookies: {
			get: () => undefined,
			set: () => undefined,
			delete: () => undefined,
			serialize: () => '',
			getAll: () => []
		}
	} as never;
}

describe('hooks public API guard', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('allows onboarding endpoint when public API is disabled', async () => {
		getAuthSettingsMock.mockResolvedValueOnce({ publicApiEnabled: false });
		const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

		const response = await handle({
			event: createEvent('/api/v1/me/onboarding'),
			resolve
		} as never);

		expect(response.status).toBe(200);
		expect(resolve).toHaveBeenCalled();
		expect(getAuthSettingsMock).not.toHaveBeenCalled();
	});

	it('blocks non-whitelisted API endpoints when public API is disabled', async () => {
		getAuthSettingsMock.mockResolvedValueOnce({ publicApiEnabled: false });
		const resolve = vi.fn(async () => new Response('ok', { status: 200 }));

		const response = await handle({
			event: createEvent('/api/v1/shares'),
			resolve
		} as never);

		expect(getAuthSettingsMock).toHaveBeenCalledWith({ publicApiEnabled: true });
		expect(resolve).not.toHaveBeenCalled();
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.error.code).toBe('PUBLIC_API_DISABLED');
	});
});
