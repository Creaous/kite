import { randomUUID } from 'node:crypto';

import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { building } from '$app/environment';
import { assertAuthEnvironmentForRuntime, auth } from '$lib/server/auth';
import {
	getClientIpAddress,
	logAuditEvent,
	sanitizeAuditPayload,
	toAuditHttpPayload
} from '$lib/server/services/audit';
import { getAuthSettings } from '$lib/server/services/settings';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { json } from '@sveltejs/kit';

const API_PREFIX = '/api';
const API_WHITELIST_PREFIXES = ['/api/auth', '/api/v1/uploads', '/api/v1/me/onboarding'] as const;
const REQUEST_LOGGING_ENABLED =
	process.env.REQUEST_LOGGING_ENABLED === 'true' ||
	(process.env.NODE_ENV === 'production' && process.env.REQUEST_LOGGING_ENABLED !== 'false');
const AUDIT_LOGGING_ENABLED = process.env.AUDIT_LOGGING_ENABLED !== 'false';
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const SENSITIVE_QUERY_KEY_PATTERN = /(token|password|secret|key)/i;
const MAX_CAPTURED_BODY_SIZE_BYTES = 32_000;

type ResourceInfo = {
	type: string;
	id: string | null;
};

function toSafeQuery(searchParams: URLSearchParams) {
	if (!searchParams || Array.from(searchParams.keys()).length === 0) {
		return null;
	}

	const redacted = new URLSearchParams();
	for (const [key, value] of searchParams.entries()) {
		if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
			redacted.set(key, '[REDACTED]');
			continue;
		}

		redacted.set(key, value);
	}

	const queryString = redacted.toString();
	return queryString ? `?${queryString}` : null;
}

function toAuthAuditAction(pathname: string, method: string, status: number) {
	const suffix = pathname.startsWith('/api/auth') ? pathname.slice('/api/auth'.length) : pathname;

	let action = 'auth.request';
	if (suffix.startsWith('/sign-in/email')) action = 'auth.sign_in.email';
	else if (suffix.startsWith('/sign-in/social')) action = 'auth.sign_in.social';
	else if (suffix.startsWith('/sign-in/anonymous')) action = 'auth.sign_in.anonymous';
	else if (suffix.startsWith('/sign-up/email')) action = 'auth.sign_up.email';
	else if (suffix.startsWith('/forget-password')) action = 'auth.password_reset.requested';
	else if (suffix.startsWith('/reset-password')) action = 'auth.password_reset.completed';
	else if (suffix.startsWith('/get-session')) action = 'auth.session.read';
	else if (suffix.startsWith('/sign-out')) action = 'auth.sign_out';
	else if (suffix.startsWith('/impersonate-user')) action = 'auth.session.impersonate.started';
	else if (suffix.startsWith('/stop-impersonating')) action = 'auth.session.impersonate.stopped';

	if (status >= 400) {
		return `${action}.failed`;
	}

	if (action === 'auth.request') {
		return `${action}.${method.toLowerCase()}`;
	}

	return action;
}

async function captureBodySnapshot(
	headers: Headers,
	readText: () => Promise<string>,
	options?: { skipHtml?: boolean; expandActionResultData?: boolean }
): Promise<unknown | null> {
	const contentType = headers.get('content-type')?.toLowerCase() ?? '';
	const isHtmlContent =
		contentType.includes('text/html') || contentType.includes('application/xhtml+xml');
	if (options?.skipHtml && isHtmlContent) {
		return null;
	}

	const isSupportedTextContent =
		contentType.includes('json') ||
		contentType.startsWith('text/') ||
		contentType.includes('x-www-form-urlencoded') ||
		contentType.includes('xml');

	if (!isSupportedTextContent) {
		return null;
	}

	try {
		const text = await readText();
		if (!text) {
			return null;
		}

		const trimmed =
			text.length > MAX_CAPTURED_BODY_SIZE_BYTES
				? `${text.slice(0, MAX_CAPTURED_BODY_SIZE_BYTES)}...[truncated]`
				: text;

		if (contentType.includes('json')) {
			const parsed = JSON.parse(trimmed);
			const expanded = options?.expandActionResultData ? expandActionResultData(parsed) : parsed;
			return sanitizeAuditPayload(expanded);
		}

		if (contentType.includes('x-www-form-urlencoded')) {
			return sanitizeAuditPayload(parseFormEncodedBody(trimmed));
		}

		return sanitizeAuditPayload(trimmed);
	} catch {
		return null;
	}
}

function parseFormEncodedBody(rawBody: string) {
	const params = new URLSearchParams(rawBody);
	const output: Record<string, unknown> = {};

	for (const key of new Set(params.keys())) {
		const values = params.getAll(key);
		output[key] = values.length <= 1 ? (values[0] ?? '') : values;
	}

	return output;
}

function extractFormActionName(searchParams: URLSearchParams) {
	for (const key of searchParams.keys()) {
		if (!key.startsWith('/')) {
			continue;
		}

		const actionName = key.slice(1).replace(/=$/, '').trim();
		return actionName || null;
	}

	return null;
}

function readBodyId(requestBody: unknown, ...candidateKeys: string[]) {
	if (!requestBody || typeof requestBody !== 'object') {
		return null;
	}

	for (const key of candidateKeys) {
		const value = (requestBody as Record<string, unknown>)[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value;
		}
	}

	return null;
}

function mapFormActionBase(pathname: string, actionName: string) {
	if (pathname === '/sign-in') {
		switch (actionName) {
			case 'email':
				return 'auth.sign_in.email';
			case 'social':
				return 'auth.sign_in.social';
		}
	}

	if (pathname === '/sign-up') {
		if (actionName === 'default') {
			return 'auth.sign_up.email';
		}
	}

	if (pathname === '/admin') {
		switch (actionName) {
			case 'updateRole':
				return 'user.role.updated';
			case 'toggleSuspension':
				return 'user.suspension.updated';
			case 'impersonate':
				return 'auth.session.impersonate.started';
			case 'saveBranding':
				return 'admin.settings.branding.updated';
			case 'saveAuthSettings':
				return 'admin.settings.auth.updated';
			case 'saveAlertSettings':
				return 'admin.settings.alert.updated';
			case 'runMaintenance':
				return 'admin.maintenance.queued';
		}
	}

	if (pathname === '/share-requests') {
		switch (actionName) {
			case 'create':
				return 'share_request.created';
			case 'edit':
				return 'share_request.updated';
			case 'delete':
				return 'share_request.deleted';
			case 'email':
				return 'share_request.email.sent';
		}
	}

	if (pathname.startsWith('/s/') && actionName === 'unlock') {
		return 'share.unlocked';
	}

	if (pathname.startsWith('/r/') && actionName === 'respond') {
		return 'share_request.responded';
	}

	if (pathname === '/shares') {
		switch (actionName) {
			case 'edit':
				return 'share.updated';
			case 'delete':
				return 'share.deleted';
		}
	}

	return `route.form.${actionName}`;
}

function mapFormActionResource(
	pathname: string,
	actionName: string,
	requestBody: unknown
): ResourceInfo {
	if (pathname === '/sign-in') {
		switch (actionName) {
			case 'email':
				return { type: 'auth', id: '/api/auth/sign-in/email' };
			case 'social':
				return { type: 'auth', id: '/api/auth/sign-in/social' };
		}
	}

	if (pathname === '/sign-up') {
		if (actionName === 'default') {
			return { type: 'auth', id: '/api/auth/sign-up/email' };
		}
	}

	if (pathname === '/admin') {
		switch (actionName) {
			case 'updateRole':
			case 'toggleSuspension':
			case 'impersonate':
				return {
					type: 'user',
					id: readBodyId(requestBody, 'userId')
				};
			case 'saveBranding':
				return { type: 'settings', id: '/api/v1/admin/branding' };
			case 'saveAuthSettings':
				return { type: 'settings', id: '/api/v1/admin/auth-settings' };
			case 'saveAlertSettings':
				return { type: 'settings', id: '/api/v1/admin/alert-settings' };
			case 'runMaintenance':
				return { type: 'maintenance', id: '/api/v1/admin/maintenance' };
		}
	}

	if (pathname === '/share-requests') {
		return {
			type: 'share_request',
			id: readBodyId(requestBody, 'id', 'requestId', 'code')
		};
	}

	if (pathname.startsWith('/s/')) {
		return { type: 'share', id: pathname.split('/').filter(Boolean)[1] ?? null };
	}

	if (pathname.startsWith('/r/')) {
		return { type: 'share_request', id: pathname.split('/').filter(Boolean)[1] ?? null };
	}

	if (pathname === '/shares') {
		return {
			type: 'share',
			id: readBodyId(requestBody, 'id', 'shareId')
		};
	}

	return {
		type: 'route',
		id: pathname
	};
}

function tryParseJsonString(input: string) {
	const trimmed = input.trim();
	if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
		return null;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

function tryDecodeIndexedActionPayload(value: unknown): unknown {
	if (!Array.isArray(value) || value.length === 0) {
		return value;
	}

	const root = value[0];
	if (!root || typeof root !== 'object' || Array.isArray(root)) {
		return value;
	}

	const rootValues = Object.values(root as Record<string, unknown>);
	const candidateRefs = rootValues.filter(
		(entry): entry is number => typeof entry === 'number' && Number.isInteger(entry)
	);
	if (candidateRefs.length === 0 || !candidateRefs.every((idx) => idx >= 0 && idx < value.length)) {
		return value;
	}

	const dereference = (entry: unknown, stack: Set<number>): unknown => {
		if (
			typeof entry === 'number' &&
			Number.isInteger(entry) &&
			entry >= 0 &&
			entry < value.length
		) {
			if (stack.has(entry)) {
				return null;
			}

			const nextStack = new Set(stack);
			nextStack.add(entry);
			return dereference(value[entry], nextStack);
		}

		if (Array.isArray(entry)) {
			return entry.map((item) => dereference(item, stack));
		}

		if (entry && typeof entry === 'object') {
			const output: Record<string, unknown> = {};
			for (const [key, item] of Object.entries(entry as Record<string, unknown>)) {
				output[key] = dereference(item, stack);
			}
			return output;
		}

		return entry;
	};

	return dereference(root, new Set([0]));
}

function expandActionResultData(responseBody: unknown) {
	if (!responseBody || typeof responseBody !== 'object') {
		return responseBody;
	}

	const output = { ...(responseBody as Record<string, unknown>) };
	if (typeof output.data !== 'string') {
		return output;
	}

	const parsedData = tryParseJsonString(output.data);
	if (parsedData === null) {
		return output;
	}

	output.data = tryDecodeIndexedActionPayload(parsedData);
	return output;
}

function deriveRouteAction(
	pathname: string,
	method: string,
	status: number,
	searchParams: URLSearchParams
) {
	const formActionName = extractFormActionName(searchParams);
	if (formActionName) {
		const base = mapFormActionBase(pathname, formActionName);
		return status >= 400 ? `${base}.failed` : base;
	}

	if (pathname === '/sign-up' && method === 'POST') {
		return status >= 400 ? 'auth.sign_up.email.failed' : 'auth.sign_up.email';
	}

	if (pathname === '/sign-in' && method === 'POST') {
		return status >= 400 ? 'auth.sign_in.failed' : 'auth.sign_in';
	}

	if (pathname === '/api/v1/shares' && method === 'POST') {
		return status >= 400 ? 'share.create.failed' : 'share.created';
	}

	if (pathname.startsWith('/api/v1/shares/') && method === 'PATCH') {
		return status >= 400 ? 'share.update.failed' : 'share.updated';
	}

	if (pathname.startsWith('/api/v1/shares/') && method === 'DELETE') {
		return status >= 400 ? 'share.delete.failed' : 'share.deleted';
	}

	if (pathname === '/api/v1/uploads' && method === 'POST') {
		return status >= 400 ? 'upload.create.failed' : 'upload.created';
	}

	if (status >= 400) {
		return 'http.request.failed';
	}

	return 'http.request.completed';
}

function deriveResourceInfo(
	pathname: string,
	searchParams: URLSearchParams,
	requestBody: unknown,
	responseBody: unknown
) {
	const formActionName = extractFormActionName(searchParams);
	if (formActionName) {
		return mapFormActionResource(pathname, formActionName, requestBody);
	}

	if (pathname === '/sign-up') {
		return { type: 'auth', id: '/api/auth/sign-up/email' };
	}

	if (pathname === '/sign-in') {
		return { type: 'auth', id: '/api/auth/sign-in' };
	}

	const pathParts = pathname.split('/').filter(Boolean);

	if (pathname === '/api/v1/shares') {
		const id =
			typeof responseBody === 'object' && responseBody && 'data' in responseBody
				? ((responseBody as { data?: { id?: unknown } }).data?.id ?? null)
				: null;
		return {
			type: 'share',
			id: typeof id === 'string' ? id : null
		};
	}

	if (pathname === '/api/v1/uploads') {
		const id =
			typeof responseBody === 'object' && responseBody && 'data' in responseBody
				? ((responseBody as { data?: { id?: unknown } }).data?.id ?? null)
				: null;
		return {
			type: 'upload',
			id: typeof id === 'string' ? id : null
		};
	}

	if (
		pathParts.length >= 4 &&
		pathParts[0] === 'api' &&
		pathParts[1] === 'v1' &&
		pathParts[2] === 'shares'
	) {
		return {
			type: 'share',
			id: pathParts[3] ?? null
		};
	}

	if (
		pathParts.length >= 4 &&
		pathParts[0] === 'api' &&
		pathParts[1] === 'v1' &&
		pathParts[2] === 'uploads'
	) {
		return {
			type: 'upload',
			id: pathParts[3] ?? null
		};
	}

	return {
		type: 'route',
		id: pathname
	};
}

function isWhitelistedApiPath(pathname: string) {
	return API_WHITELIST_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
	);
}

export const handlePublicApiAvailability: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Allow server-side event.fetch subrequests to continue working even when public API is disabled.
	if (event.isSubRequest) {
		return resolve(event);
	}

	if (!pathname.startsWith(API_PREFIX) || isWhitelistedApiPath(pathname)) {
		return resolve(event);
	}

	const authSettings = await getAuthSettings({ publicApiEnabled: true });
	if (authSettings.publicApiEnabled) {
		return resolve(event);
	}

	return json(
		{
			error: {
				code: 'PUBLIC_API_DISABLED',
				message: 'Public API is disabled by an administrator'
			}
		},
		{ status: 503 }
	);
};

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('referrer-policy', 'no-referrer');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('cross-origin-opener-policy', 'same-origin');
	response.headers.set('cross-origin-resource-policy', 'same-origin');

	if (process.env.NODE_ENV === 'production') {
		response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
	}

	return response;
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	assertAuthEnvironmentForRuntime();

	if (event.url.pathname === '/api/auth' || event.url.pathname.startsWith('/api/auth/')) {
		const requestId = event.request.headers.get('x-request-id')?.trim() || randomUUID();
		const startedAt = performance.now();
		const safeQuery = toSafeQuery(event.url.searchParams);
		const requestBody = await captureBodySnapshot(event.request.headers, () =>
			event.request.clone().text()
		);
		const userAgent = event.request.headers.get('user-agent');
		const actorSession = await auth.api
			.getSession({ headers: event.request.headers })
			.catch(() => null);
		const ipAddress =
			typeof actorSession?.session?.ipAddress === 'string' &&
			actorSession.session.ipAddress.trim().length > 0
				? actorSession.session.ipAddress
				: getClientIpAddress({
						headers: event.request.headers,
						getClientAddress: () => event.getClientAddress(),
						trustProxy: TRUST_PROXY
					});

		try {
			const response = await auth.handler(event.request);
			response.headers.set('x-request-id', requestId);
			const responseBody = await captureBodySnapshot(
				response.headers,
				() => response.clone().text(),
				{ skipHtml: true, expandActionResultData: true }
			);

			if (AUDIT_LOGGING_ENABLED) {
				const durationMs = Number((performance.now() - startedAt).toFixed(2));
				await logAuditEvent({
					actorId: actorSession?.user?.id ?? null,
					action: toAuthAuditAction(event.url.pathname, event.request.method, response.status),
					resourceType: 'auth',
					resourceId: event.url.pathname,
					payload: toAuditHttpPayload({
						requestId,
						method: event.request.method,
						path: event.url.pathname,
						query: safeQuery,
						status: response.status,
						durationMs,
						ipAddress,
						userAgent,
						isSubRequest: event.isSubRequest,
						requestBody,
						responseBody,
						resource: {
							type: 'auth',
							id: event.url.pathname
						}
					})
				});
			}

			return response;
		} catch (error) {
			if (AUDIT_LOGGING_ENABLED) {
				const durationMs = Number((performance.now() - startedAt).toFixed(2));
				await logAuditEvent({
					actorId: actorSession?.user?.id ?? null,
					action: toAuthAuditAction(event.url.pathname, event.request.method, 500),
					resourceType: 'auth',
					resourceId: event.url.pathname,
					payload: toAuditHttpPayload({
						requestId,
						method: event.request.method,
						path: event.url.pathname,
						query: safeQuery,
						status: 500,
						durationMs,
						ipAddress,
						userAgent,
						isSubRequest: event.isSubRequest,
						errorMessage: error instanceof Error ? error.message : 'Unknown error'
					})
				});
			}

			throw error;
		}
	}

	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

const handleRequestLogging: Handle = async ({ event, resolve }) => {
	if (event.isSubRequest) {
		return resolve(event);
	}

	const startedAt = performance.now();
	const requestId = event.request.headers.get('x-request-id')?.trim() || randomUUID();
	const safeQuery = toSafeQuery(event.url.searchParams);
	const requestBody = await captureBodySnapshot(event.request.headers, () =>
		event.request.clone().text()
	);
	const userAgent = event.request.headers.get('user-agent');
	const ipAddress = getClientIpAddress({
		headers: event.request.headers,
		getClientAddress: () => event.getClientAddress(),
		trustProxy: TRUST_PROXY
	});

	try {
		const response = await resolve(event);
		response.headers.set('x-request-id', requestId);
		const responseBody = await captureBodySnapshot(
			response.headers,
			() => response.clone().text(),
			{ skipHtml: true, expandActionResultData: true }
		);
		const durationMs = Number((performance.now() - startedAt).toFixed(2));
		const resource = deriveResourceInfo(
			event.url.pathname,
			event.url.searchParams,
			requestBody,
			responseBody
		);

		if (AUDIT_LOGGING_ENABLED) {
			await logAuditEvent({
				actorId: event.locals.user?.id ?? null,
				action: deriveRouteAction(
					event.url.pathname,
					event.request.method,
					response.status,
					event.url.searchParams
				),
				resourceType: resource.type,
				resourceId: resource.id,
				payload: toAuditHttpPayload({
					requestId,
					method: event.request.method,
					path: event.url.pathname,
					query: safeQuery,
					status: response.status,
					durationMs,
					ipAddress,
					userAgent,
					isSubRequest: event.isSubRequest,
					requestBody,
					responseBody,
					resource
				})
			});
		}

		if (REQUEST_LOGGING_ENABLED) {
			console.log(
				JSON.stringify({
					type: 'http_request',
					requestId,
					method: event.request.method,
					path: event.url.pathname,
					status: response.status,
					durationMs,
					userId: event.locals.user?.id ?? null
				})
			);
		}

		return response;
	} catch (error) {
		const durationMs = Number((performance.now() - startedAt).toFixed(2));
		const resource = deriveResourceInfo(
			event.url.pathname,
			event.url.searchParams,
			requestBody,
			null
		);

		if (AUDIT_LOGGING_ENABLED) {
			await logAuditEvent({
				actorId: event.locals.user?.id ?? null,
				action: deriveRouteAction(
					event.url.pathname,
					event.request.method,
					500,
					event.url.searchParams
				),
				resourceType: resource.type,
				resourceId: resource.id,
				payload: toAuditHttpPayload({
					requestId,
					method: event.request.method,
					path: event.url.pathname,
					query: safeQuery,
					status: 500,
					durationMs,
					ipAddress,
					userAgent,
					isSubRequest: event.isSubRequest,
					requestBody,
					errorMessage: error instanceof Error ? error.message : 'Unknown error'
				})
			});
		}

		if (REQUEST_LOGGING_ENABLED) {
			console.error(
				JSON.stringify({
					type: 'http_request_error',
					requestId,
					method: event.request.method,
					path: event.url.pathname,
					durationMs,
					userId: event.locals.user?.id ?? null,
					error: error instanceof Error ? error.message : 'Unknown error'
				})
			);
		}

		throw error;
	}
};

export const __test_only = {
	parseFormEncodedBody,
	extractFormActionName,
	mapFormActionBase,
	mapFormActionResource,
	expandActionResultData,
	deriveRouteAction,
	deriveResourceInfo
};

export const handle: Handle = sequence(
	handleParaglide,
	handlePublicApiAvailability,
	handleBetterAuth,
	handleRequestLogging,
	handleSecurityHeaders
);
