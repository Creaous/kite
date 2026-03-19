import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';

import { db } from '$lib/server/db';
import { auditLog, user } from '$lib/server/db/schema';

type JsonRecord = Record<string, unknown>;
const REDACTED_VALUE = '[REDACTED]';
const MAX_AUDIT_STRING_LENGTH = 2000;
const SENSITIVE_FIELD_PATTERN =
	/(password|passphrase|token|secret|authorization|cookie|apikey|api_key|session|credential|hash)/i;

export type AuditLogEventInput = {
	actorId?: string | null;
	action: string;
	resourceType?: string | null;
	resourceId?: string | null;
	payload?: JsonRecord | null;
};

export type AuditHttpPayloadInput = {
	requestId: string;
	method: string;
	path: string;
	status: number;
	durationMs: number;
	ipAddress: string | null;
	userAgent: string | null;
	query?: string | null;
	isSubRequest?: boolean;
	errorMessage?: string | null;
	requestBody?: unknown;
	responseBody?: unknown;
	resource?: {
		type?: string | null;
		id?: string | null;
	};
};

export type AuditLogListOptions = {
	limit?: number;
	offset?: number;
	actorId?: string;
	query?: string;
	actionLike?: string;
	method?: string;
	pathLike?: string;
	status?: number;
	from?: Date;
	to?: Date;
};

function clampPageSize(limit: number | undefined) {
	if (!Number.isFinite(limit)) {
		return 100;
	}

	return Math.min(Math.max(Math.floor(limit ?? 100), 1), 500);
}

function normalizeOffset(offset: number | undefined) {
	if (!Number.isFinite(offset)) {
		return 0;
	}

	return Math.max(Math.floor(offset ?? 0), 0);
}

export function getClientIpAddress(input: {
	headers: Headers;
	getClientAddress?: () => string;
	trustProxy?: boolean;
}) {
	if (input.trustProxy) {
		const cfConnectingIp = input.headers.get('cf-connecting-ip')?.trim();
		if (cfConnectingIp) {
			return cfConnectingIp;
		}

		const forwardedFor = input.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
		if (forwardedFor) {
			return forwardedFor;
		}

		const realIp = input.headers.get('x-real-ip')?.trim();
		if (realIp) {
			return realIp;
		}
	}

	try {
		const clientAddress = input.getClientAddress?.();
		return clientAddress?.trim() || null;
	} catch {
		return null;
	}
}

export function toAuditHttpPayload(input: AuditHttpPayloadInput): JsonRecord {
	return {
		request: {
			id: input.requestId,
			method: input.method,
			path: input.path,
			query: input.query ?? null,
			status: input.status,
			durationMs: input.durationMs,
			ipAddress: input.ipAddress,
			userAgent: input.userAgent,
			isSubRequest: Boolean(input.isSubRequest),
			body: sanitizeAuditPayload(input.requestBody)
		},
		response: {
			body: sanitizeAuditPayload(input.responseBody)
		},
		resource: {
			type: input.resource?.type ?? null,
			id: input.resource?.id ?? null
		},
		error: input.errorMessage ? { message: input.errorMessage } : null
	};
}

function sanitizeStringValue(value: string) {
	if (value.length <= MAX_AUDIT_STRING_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_AUDIT_STRING_LENGTH)}...[truncated]`;
}

export function sanitizeAuditPayload(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value ?? null;
	}

	if (typeof value === 'string') {
		return sanitizeStringValue(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.slice(0, 100).map((item) => sanitizeAuditPayload(item));
	}

	if (typeof value === 'object') {
		const output: Record<string, unknown> = {};
		for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
			if (SENSITIVE_FIELD_PATTERN.test(key)) {
				output[key] = REDACTED_VALUE;
				continue;
			}

			output[key] = sanitizeAuditPayload(fieldValue);
		}

		return output;
	}

	return String(value);
}

export async function createAuditLogEvent(input: AuditLogEventInput) {
	const [created] = await db
		.insert(auditLog)
		.values({
			actorId: input.actorId ?? null,
			action: input.action,
			resourceType: input.resourceType ?? null,
			resourceId: input.resourceId ?? null,
			payload: input.payload ?? null
		})
		.returning();

	return created;
}

export async function logAuditEvent(input: AuditLogEventInput) {
	try {
		await createAuditLogEvent(input);
	} catch (error) {
		console.error('[audit] failed to persist audit event', {
			action: input.action,
			resourceType: input.resourceType,
			resourceId: input.resourceId,
			error: error instanceof Error ? error.message : 'Unknown error'
		});
	}
}

export async function listAuditLogEvents(options: AuditLogListOptions = {}) {
	const limit = clampPageSize(options.limit);
	const offset = normalizeOffset(options.offset);

	const whereParts = [];

	if (options.actorId) {
		whereParts.push(eq(auditLog.actorId, options.actorId));
	}

	if (options.actionLike?.trim()) {
		whereParts.push(ilike(auditLog.action, `%${options.actionLike.trim()}%`));
	}

	if (options.query?.trim()) {
		const q = `%${options.query.trim()}%`;
		whereParts.push(
			or(
				ilike(auditLog.action, q),
				ilike(sql`coalesce(${auditLog.resourceType}, '')`, q),
				ilike(sql`coalesce(${auditLog.resourceId}, '')`, q),
				ilike(sql`coalesce(${user.email}, '')`, q),
				ilike(sql`coalesce(${user.name}, '')`, q),
				ilike(sql`coalesce(${auditLog.payload}::text, '')`, q)
			)
		);
	}

	if (options.method?.trim()) {
		whereParts.push(
			eq(
				sql`lower(coalesce(${auditLog.payload}->'request'->>'method', ''))`,
				options.method.trim().toLowerCase()
			)
		);
	}

	if (options.pathLike?.trim()) {
		whereParts.push(
			ilike(
				sql`coalesce(${auditLog.payload}->'request'->>'path', '')`,
				`%${options.pathLike.trim()}%`
			)
		);
	}

	if (Number.isFinite(options.status)) {
		whereParts.push(
			eq(
				sql`(${auditLog.payload}->'request'->>'status')::int`,
				Math.floor(options.status as number)
			)
		);
	}

	if (options.from) {
		whereParts.push(gte(auditLog.createdAt, options.from));
	}

	if (options.to) {
		whereParts.push(lte(auditLog.createdAt, options.to));
	}

	const whereClause = whereParts.length > 0 ? and(...whereParts) : undefined;

	const rows = await db
		.select({
			id: auditLog.id,
			actorId: auditLog.actorId,
			action: auditLog.action,
			resourceType: auditLog.resourceType,
			resourceId: auditLog.resourceId,
			payload: auditLog.payload,
			createdAt: auditLog.createdAt,
			actorEmail: user.email,
			actorName: user.name
		})
		.from(auditLog)
		.leftJoin(user, eq(auditLog.actorId, user.id))
		.where(whereClause)
		.orderBy(desc(auditLog.createdAt))
		.limit(limit)
		.offset(offset);

	const [totalRow] = await db
		.select({ total: sql<number>`count(*)::int` })
		.from(auditLog)
		.leftJoin(user, eq(auditLog.actorId, user.id))
		.where(whereClause);

	return {
		logs: rows,
		total: Number(totalRow?.total ?? 0),
		limit,
		offset
	};
}
