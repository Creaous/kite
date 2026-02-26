import { json } from '@sveltejs/kit';

export function unauthorizedResponse(message = 'Authentication required') {
	return json({ error: { code: 'UNAUTHORIZED', message } }, { status: 401 });
}

export function requireAuthenticatedUser(locals: App.Locals) {
	if (locals.user) {
		return null;
	}

	return unauthorizedResponse();
}

export function forbiddenResponse(message = 'Forbidden') {
	return json({ error: { code: 'FORBIDDEN', message } }, { status: 403 });
}

export function requireAdminUser(locals: App.Locals) {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) {
		return unauthorized;
	}

	if (locals.user?.role !== 'admin') {
		return forbiddenResponse('Admin access required');
	}

	return null;
}
