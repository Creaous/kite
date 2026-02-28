import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { auth } from '$lib/server/auth';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAdminUser } from '$lib/server/http-auth';

export const GET: RequestHandler = async ({ locals, request, url }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const search = url.searchParams.get('search') ?? undefined;
	const limit = Number(url.searchParams.get('limit') ?? 25);
	const offset = Number(url.searchParams.get('offset') ?? 0);

	try {
		const result = await auth.api.listUsers({
			headers: request.headers,
			query: {
				limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25,
				offset: Number.isFinite(offset) ? Math.max(offset, 0) : 0,
				searchField: 'email',
				sortBy: 'createdAt',
				sortDirection: 'desc',
				searchValue: search
			}
		});

		return json({ data: result }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'UNAUTHORIZED') ? 401 : 500;
		return json(
			{ error: { code: 'ADMIN_LIST_USERS_FAILED', message: 'Failed to list users' } },
			{ status }
		);
	}
};
