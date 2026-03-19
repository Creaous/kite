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

import { __test_only, handlePublicApiAvailability as handle } from './hooks.server';

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

describe('hooks audit helper mapping', () => {
	it('maps sign-in form action to auth action and resource', () => {
		const searchParams = new URLSearchParams('/email=');

		expect(__test_only.deriveRouteAction('/sign-in', 'POST', 200, searchParams)).toBe(
			'auth.sign_in.email'
		);
		expect(
			__test_only.deriveResourceInfo('/sign-in', searchParams, { email: 'user@example.com' }, null)
		).toEqual({ type: 'auth', id: '/api/auth/sign-in/email' });
	});

	it('maps admin alert form action to settings resource', () => {
		const searchParams = new URLSearchParams('/saveAlertSettings=');

		expect(__test_only.deriveRouteAction('/admin', 'POST', 200, searchParams)).toBe(
			'admin.settings.alert.updated'
		);
		expect(
			__test_only.deriveResourceInfo(
				'/admin',
				searchParams,
				{ globalAnnouncementEnabled: 'on' },
				null
			)
		).toEqual({ type: 'settings', id: '/api/v1/admin/alert-settings' });
	});

	it('expands indexed action data payload to readable object', () => {
		const expanded = __test_only.expandActionResultData({
			type: 'success',
			status: 200,
			data: '[{"success":1,"successMessage":2},true,"Alert settings saved."]'
		}) as {
			data: { success: boolean; successMessage: string };
		};

		expect(expanded.data).toEqual({ success: true, successMessage: 'Alert settings saved.' });
	});

	it('parses form-encoded bodies into key-value payloads', () => {
		const parsed = __test_only.parseFormEncodedBody(
			'globalAnnouncementEnabled=on&globalAnnouncementMessage=test23&shareFlowAlertMessage='
		) as Record<string, unknown>;

		expect(parsed.globalAnnouncementEnabled).toBe('on');
		expect(parsed.globalAnnouncementMessage).toBe('test23');
		expect(parsed.shareFlowAlertMessage).toBe('');
	});
});
