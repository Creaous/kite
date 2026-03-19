import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { requireAdminUser } from '$lib/server/http-auth';

export const GET: RequestHandler = async ({ locals, url }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const search = url.searchParams.get('search') ?? undefined;
	const role = url.searchParams.get('role')?.trim() || undefined;
	const status = url.searchParams.get('status')?.trim() || undefined;
	const limit = Number(url.searchParams.get('limit') ?? 25);
	const offset = Number(url.searchParams.get('offset') ?? 0);
	const normalizedLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25;
	const normalizedOffset = Number.isFinite(offset) ? Math.max(offset, 0) : 0;

	const whereParts = [];

	if (search?.trim()) {
		const q = `%${search.trim()}%`;
		whereParts.push(sql`(${user.email} ILIKE ${q} OR ${user.name} ILIKE ${q})`);
	}

	if (role && (role === 'user' || role === 'trusted' || role === 'admin')) {
		whereParts.push(eq(user.role, role));
	}

	if (status === 'active') {
		whereParts.push(eq(user.banned, false));
	}

	if (status === 'banned') {
		whereParts.push(eq(user.banned, true));
	}

	const whereClause = whereParts.length > 0 ? and(...whereParts) : undefined;

	try {
		const users = await db
			.select({
				id: user.id,
				email: user.email,
				name: user.name,
				role: user.role,
				banned: user.banned,
				createdAt: user.createdAt
			})
			.from(user)
			.where(whereClause)
			.orderBy(desc(user.createdAt))
			.limit(normalizedLimit)
			.offset(normalizedOffset);

		const [totalRow] = await db
			.select({ total: sql<number>`count(*)::int` })
			.from(user)
			.where(whereClause);

		return json(
			{
				data: {
					users,
					total: Number(totalRow?.total ?? 0),
					limit: normalizedLimit,
					offset: normalizedOffset
				}
			},
			{ status: 200 }
		);
	} catch {
		return json(
			{ error: { code: 'ADMIN_LIST_USERS_FAILED', message: 'Failed to list users' } },
			{ status: 500 }
		);
	}
};
