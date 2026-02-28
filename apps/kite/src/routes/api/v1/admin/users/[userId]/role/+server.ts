import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { auth } from '$lib/server/auth';
import { requireAdminUser } from '$lib/server/http-auth';

const allowedRoles = new Set(['admin', 'user', 'trusted']);

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const userId = params.userId;
	if (!userId) {
		return json(
			{ error: { code: 'INVALID_USER_ID', message: 'Invalid user id' } },
			{ status: 400 }
		);
	}

	const body = await request.json().catch(() => ({}));
	const role = typeof body?.role === 'string' ? body.role : '';

	if (!allowedRoles.has(role)) {
		return json({ error: { code: 'INVALID_ROLE', message: 'Invalid role' } }, { status: 400 });
	}

	try {
		const result = await auth.api.setRole({
			headers: request.headers,
			body: {
				userId,
				role
			}
		});

		return json({ data: result }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'ADMIN_SET_ROLE_FAILED', message: 'Failed to update role' } },
			{ status: 500 }
		);
	}
};
