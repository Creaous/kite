import { db } from '../db';
import { shareRequests, shares, shareUpload } from '../db/schema';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { createShare } from './share';
import { randomInt } from 'node:crypto';
import argon2 from '@node-rs/argon2';

export type CreateShareRequestDTO = {
	title: string;
	message?: string | null;
	requester?: { name?: string | null; email?: string | null } | null;
	hideRequesterEmail?: boolean;
	password?: string | null;
	clearPassword?: boolean;
	maxSubmissions?: number | null;
	expiresAt?: string | Date | null;
	createdBy?: string | null;
};

export type ShareRequestUpload = { uploadId: string; name?: string };

function generateCode(length = 6) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let out = '';
	for (let i = 0; i < length; i++) out += chars[randomInt(0, chars.length)];
	return out;
}

function normalizeMaxSubmissions(maxSubmissions: number | null | undefined) {
	const parsed = Number(maxSubmissions ?? 1);
	if (!Number.isFinite(parsed)) {
		return 1;
	}

	return Math.max(1, Math.floor(parsed));
}

async function getSubmissionCountByRequestId(requestId: string) {
	const [row] = await db
		.select({ count: sql<number>`count(${shares.id})` })
		.from(shares)
		.where(and(eq(shares.sourceRequestId, requestId), isNull(shares.deletedAt)));

	return Number(row?.count ?? 0);
}

export async function createShareRequest(dto: CreateShareRequestDTO) {
	if (!dto || !dto.title) throw new Error('Invalid share request payload');

	let code = generateCode();
	for (let i = 0; i < 5; i++) {
		const [exists] = await db
			.select({ id: shareRequests.id })
			.from(shareRequests)
			.where(and(eq(shareRequests.code, code), isNull(shareRequests.deletedAt)))
			.limit(1);
		if (!exists) break;
		code = generateCode();
	}

	const [created] = await db
		.insert(shareRequests)
		.values({
			code,
			title: dto.title,
			message: dto.message ?? null,
			passwordHash: dto.password ? await argon2.hash(dto.password) : null,
			requesterName: dto.requester?.name ?? null,
			requesterEmail: dto.requester?.email ?? null,
			hideRequesterEmail: Boolean(dto.hideRequesterEmail),
			maxSubmissions: normalizeMaxSubmissions(dto.maxSubmissions),
			expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
			createdBy: dto.createdBy ?? null
		})
		.returning();

	return {
		id: created.id,
		code: created.code,
		title: created.title,
		message: created.message,
		requesterName: created.requesterName,
		requesterEmail: created.requesterEmail,
		hideRequesterEmail: created.hideRequesterEmail,
		passwordProtected: Boolean(created.passwordHash),
		maxSubmissions: created.maxSubmissions,
		submissionCount: 0,
		expiresAt: created.expiresAt,
		status: created.status,
		createdAt: created.createdAt
	};
}

export async function respondToRequest(
	code: string,
	uploads: ShareRequestUpload[],
	actor?: { userId: string; isAdmin?: boolean }
) {
	if (!code) throw new Error('Missing request code');
	if (!Array.isArray(uploads) || uploads.length === 0) throw new Error('No uploads provided');

	const [req] = await db
		.select()
		.from(shareRequests)
		.where(and(eq(shareRequests.code, code), isNull(shareRequests.deletedAt)))
		.limit(1);
	if (!req) throw new Error('Share request not found');
	if (req.status !== 'open') throw new Error('Share request is not open');
	if (req.expiresAt && new Date(req.expiresAt) < new Date()) {
		throw new Error('Share request has expired');
	}

	const submissionCount = await getSubmissionCountByRequestId(req.id);
	if (submissionCount >= req.maxSubmissions) {
		await db
			.update(shareRequests)
			.set({ status: 'fulfilled' })
			.where(and(eq(shareRequests.id, req.id), eq(shareRequests.status, 'open')));
		throw new Error('Share request submission limit reached');
	}

	const shareDto = {
		title: req.title ?? 'Response',
		expiresAt: req.expiresAt ?? null,
		passwordHash: req.passwordHash,
		sourceRequestId: req.id,
		uploads: uploads,
		createdBy: null,
		actorUserId: actor?.userId ?? null,
		actorIsAdmin: actor?.isAdmin === true
	};

	const share = await createShare(shareDto);

	const nextSubmissionCount = submissionCount + 1;
	if (nextSubmissionCount >= req.maxSubmissions) {
		await db
			.update(shareRequests)
			.set({ status: 'fulfilled' })
			.where(and(eq(shareRequests.id, req.id), eq(shareRequests.status, 'open')));
	}

	return {
		shareId: share.id,
		submissionCount: nextSubmissionCount,
		maxSubmissions: req.maxSubmissions
	};
}

export async function getShareRequestByCode(code: string) {
	if (!code) throw new Error('Missing request code');

	const [req] = await db
		.select()
		.from(shareRequests)
		.where(and(eq(shareRequests.code, code), isNull(shareRequests.deletedAt)))
		.limit(1);

	if (!req) return null;

	return {
		id: req.id,
		code: req.code,
		title: req.title,
		message: req.message,
		requesterName: req.requesterName,
		requesterEmail: req.requesterEmail,
		hideRequesterEmail: req.hideRequesterEmail,
		passwordProtected: Boolean(req.passwordHash),
		maxSubmissions: req.maxSubmissions,
		expiresAt: req.expiresAt,
		status: req.status,
		createdAt: req.createdAt
	};
}

export async function getShareRequestById(requestId: string) {
	if (!requestId) throw new Error('Missing request id');

	const [req] = await db
		.select()
		.from(shareRequests)
		.where(and(eq(shareRequests.id, requestId), isNull(shareRequests.deletedAt)))
		.limit(1);

	if (!req) return null;

	return {
		id: req.id,
		code: req.code,
		title: req.title,
		message: req.message,
		requesterName: req.requesterName,
		requesterEmail: req.requesterEmail,
		hideRequesterEmail: req.hideRequesterEmail,
		passwordProtected: Boolean(req.passwordHash),
		maxSubmissions: req.maxSubmissions,
		expiresAt: req.expiresAt,
		status: req.status,
		createdAt: req.createdAt
	};
}

export async function listShareRequests() {
	const rows = await db
		.select({
			id: shareRequests.id,
			code: shareRequests.code,
			title: shareRequests.title,
			message: shareRequests.message,
			requesterName: shareRequests.requesterName,
			requesterEmail: shareRequests.requesterEmail,
			hideRequesterEmail: shareRequests.hideRequesterEmail,
			passwordProtected: sql<boolean>`(${shareRequests.passwordHash} is not null)`,
			maxSubmissions: shareRequests.maxSubmissions,
			expiresAt: shareRequests.expiresAt,
			status: shareRequests.status,
			createdAt: shareRequests.createdAt,
			submissionCount: sql<number>`count(${shares.id})`
		})
		.from(shareRequests)
		.leftJoin(shares, and(eq(shares.sourceRequestId, shareRequests.id), isNull(shares.deletedAt)))
		.where(isNull(shareRequests.deletedAt))
		.groupBy(shareRequests.id)
		.orderBy(desc(shareRequests.createdAt));

	return rows.map((row) => ({
		...row,
		submissionCount: Number(row.submissionCount ?? 0)
	}));
}

export async function updateShareRequest(
	requestId: string,
	dto: {
		title?: string | null;
		message?: string | null;
		requester?: { name?: string | null; email?: string | null } | null;
		hideRequesterEmail?: boolean;
		password?: string | null;
		clearPassword?: boolean;
		maxSubmissions?: number | null;
		expiresAt?: string | Date | null;
		status?: 'open' | 'fulfilled' | 'expired' | 'deleted';
	}
) {
	const values: {
		title?: string | null;
		message?: string | null;
		requesterName?: string | null;
		requesterEmail?: string | null;
		hideRequesterEmail?: boolean;
		passwordHash?: string | null;
		maxSubmissions?: number;
		expiresAt?: Date | null;
		status?: 'open' | 'fulfilled' | 'expired' | 'deleted';
	} = {};

	if (dto.title !== undefined) values.title = dto.title;
	if (dto.message !== undefined) values.message = dto.message;
	if (dto.requester !== undefined) {
		values.requesterName = dto.requester?.name ?? null;
		values.requesterEmail = dto.requester?.email ?? null;
	}
	if (dto.hideRequesterEmail !== undefined) values.hideRequesterEmail = dto.hideRequesterEmail;
	if (dto.clearPassword === true) {
		values.passwordHash = null;
	} else if (dto.password !== undefined && dto.password !== null) {
		if (dto.password.trim().length > 0) {
			values.passwordHash = await argon2.hash(dto.password);
		}
	}
	if (dto.maxSubmissions !== undefined) {
		values.maxSubmissions = normalizeMaxSubmissions(dto.maxSubmissions);
	}
	if (dto.expiresAt !== undefined)
		values.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
	if (dto.status !== undefined) values.status = dto.status;

	const [updated] = await db
		.update(shareRequests)
		.set(values)
		.where(and(eq(shareRequests.id, requestId), isNull(shareRequests.deletedAt)))
		.returning();

	if (!updated) throw new Error('Share request not found');

	return {
		id: updated.id,
		code: updated.code,
		title: updated.title,
		message: updated.message,
		requesterName: updated.requesterName,
		requesterEmail: updated.requesterEmail,
		hideRequesterEmail: updated.hideRequesterEmail,
		passwordProtected: Boolean(updated.passwordHash),
		maxSubmissions: updated.maxSubmissions,
		expiresAt: updated.expiresAt,
		status: updated.status,
		createdAt: updated.createdAt
	};
}

export async function listShareRequestSubmissions(requestId: string) {
	if (!requestId) throw new Error('Missing request id');

	const [request] = await db
		.select({ id: shareRequests.id })
		.from(shareRequests)
		.where(and(eq(shareRequests.id, requestId), isNull(shareRequests.deletedAt)))
		.limit(1);

	if (!request) throw new Error('Share request not found');

	const rows = await db
		.select({
			id: shares.id,
			code: shares.code,
			title: shares.title,
			status: shares.status,
			expiresAt: shares.expiresAt,
			createdAt: shares.createdAt,
			uploadCount: sql<number>`count(${shareUpload.uploadId})`
		})
		.from(shares)
		.leftJoin(shareUpload, eq(shareUpload.shareId, shares.id))
		.where(and(eq(shares.sourceRequestId, requestId), isNull(shares.deletedAt)))
		.groupBy(shares.id)
		.orderBy(desc(shares.createdAt));

	return rows.map((row) => ({
		...row,
		uploadCount: Number(row.uploadCount ?? 0)
	}));
}

export async function softDeleteShareRequest(requestId: string) {
	const [updated] = await db
		.update(shareRequests)
		.set({ deletedAt: new Date(), status: 'deleted' })
		.where(and(eq(shareRequests.id, requestId), isNull(shareRequests.deletedAt)))
		.returning({ id: shareRequests.id });

	if (!updated) throw new Error('Share request not found');
	return { requestId: updated.id };
}
