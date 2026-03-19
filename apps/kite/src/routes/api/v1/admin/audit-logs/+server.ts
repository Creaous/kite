import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAdminUser } from '$lib/server/http-auth';
import { listAuditLogEvents } from '$lib/server/services/audit';

function parseOptionalDate(raw: string | null) {
	if (!raw) {
		return undefined;
	}

	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		return undefined;
	}

	return parsed;
}

function parseOptionalNumber(raw: string | null) {
	if (!raw) {
		return undefined;
	}

	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) {
		return undefined;
	}

	return parsed;
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const limitRaw = Number(url.searchParams.get('limit') ?? 100);
	const offsetRaw = Number(url.searchParams.get('offset') ?? 0);
	const actorId = url.searchParams.get('actorId')?.trim() || undefined;
	const query = url.searchParams.get('q')?.trim() || undefined;
	const actionLike = url.searchParams.get('action')?.trim() || undefined;
	const method = url.searchParams.get('method')?.trim() || undefined;
	const pathLike = url.searchParams.get('path')?.trim() || undefined;
	const status = parseOptionalNumber(url.searchParams.get('status'));
	const from = parseOptionalDate(url.searchParams.get('from'));
	const to = parseOptionalDate(url.searchParams.get('to'));

	try {
		const result = await listAuditLogEvents({
			limit: Number.isFinite(limitRaw) ? limitRaw : 100,
			offset: Number.isFinite(offsetRaw) ? offsetRaw : 0,
			actorId,
			query,
			actionLike,
			method,
			pathLike,
			status,
			from,
			to
		});

		return json({ data: result }, { status: 200 });
	} catch {
		return json(
			{
				error: {
					code: 'ADMIN_AUDIT_LOG_LIST_FAILED',
					message: 'Failed to load audit logs'
				}
			},
			{ status: 500 }
		);
	}
};
