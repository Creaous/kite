import { randomInt } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '../db';
import { shareRequests } from '../db/schema';
import { createShare } from './share';

export type CreateShareRequestDTO = {
	title: string;
	message?: string | null;
	requester?: { name?: string | null; email?: string | null } | null;
	hideRequesterEmail?: boolean;
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
			requesterName: dto.requester?.name ?? null,
			requesterEmail: dto.requester?.email ?? null,
			hideRequesterEmail: Boolean(dto.hideRequesterEmail),
			expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
			createdBy: dto.createdBy ?? null
		})
		.returning();

	return created;
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

	const shareDto = {
		title: req.title ?? 'Response',
		expiresAt: req.expiresAt ?? null,
		uploads: uploads,
		createdBy: null,
		actorUserId: actor?.userId ?? null,
		actorIsAdmin: actor?.isAdmin === true
	};

	const share = await createShare(shareDto);

	await db.update(shareRequests).set({ status: 'fulfilled' }).where(eq(shareRequests.id, req.id));

	return { shareId: share.id };
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
			expiresAt: shareRequests.expiresAt,
			status: shareRequests.status,
			createdAt: shareRequests.createdAt
		})
		.from(shareRequests)
		.where(and(isNull(shareRequests.deletedAt), eq(shareRequests.status, 'open')))
		.orderBy(desc(shareRequests.createdAt));

	return rows;
}

export async function updateShareRequest(
	requestId: string,
	dto: {
		title?: string | null;
		message?: string | null;
		requester?: { name?: string | null; email?: string | null } | null;
		hideRequesterEmail?: boolean;
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
		expiresAt: updated.expiresAt,
		status: updated.status,
		createdAt: updated.createdAt
	};
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
