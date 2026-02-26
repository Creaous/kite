import { db } from '../db';
import { shares, shareUpload } from '../db/schema';
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import argon2 from '@node-rs/argon2';
import { uploads } from '../db/schema';
import { generateDownloadToken } from './token';
import { promises as fs } from 'node:fs';
import { zipSync } from 'fflate';

export type CreateShareDTO = {
	title?: string | null;
	expiresAt?: string | Date | null;
	password?: string | null;
	message?: string | null;
	hideMessageBehindPassword?: boolean;
	maxDownloads?: number | null;
	highSensitivity?: boolean;
	uploads: { uploadId: string; name?: string }[];
	createdBy?: string | null;
};

const DEFAULT_SHARE_EXPIRY_DAYS = 30;

function generateCode(length = 6) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let out = '';
	for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
	return out;
}

function toSafeFilename(filename: string | null | undefined, fallback: string) {
	const source = filename?.trim() || fallback;
	return source.replace(/[\\/\r\n\0]/g, '_');
}

export async function createShare(dto: CreateShareDTO) {
	if (!dto || !Array.isArray(dto.uploads) || dto.uploads.length === 0) {
		throw new Error('Invalid share payload: missing uploads');
	}

	// generate unique code
	let code = generateCode();
	for (let i = 0; i < 5; i++) {
		const [exists] = await db
			.select({ id: shares.id })
			.from(shares)
			.where(and(eq(shares.code, code), isNull(shares.deletedAt)))
			.limit(1);
		if (!exists) break;
		code = generateCode();
	}

	let _passwordHash: string | null = null;
	const passwordProtected = !!dto.password;
	if (dto.password) {
		_passwordHash = await argon2.hash(dto.password);
	}

	const parsedMaxDownloads = Number(dto.maxDownloads ?? 0);
	const maxDownloads = Number.isFinite(parsedMaxDownloads)
		? Math.max(0, Math.floor(parsedMaxDownloads))
		: 0;

	const expiresAt = dto.expiresAt
		? new Date(dto.expiresAt)
		: new Date(Date.now() + DEFAULT_SHARE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

	const [created] = await db
		.insert(shares)
		.values({
			code,
			title: dto.title ?? null,
			passwordHash: _passwordHash,
			passwordProtected,
			highSensitivity: Boolean(dto.highSensitivity),
			message: dto.message ?? null,
			hideMessageBehindPassword: dto.hideMessageBehindPassword ?? false,
			expiresAt,
			createdBy: dto.createdBy ?? null,
			maxDownloads
		})
		.returning();

	// attach uploads
	for (const u of dto.uploads) {
		if (!u || !u.uploadId) continue;

		const [found] = await db
			.select({ id: uploads.id })
			.from(uploads)
			.where(and(eq(uploads.id, u.uploadId), isNull(uploads.deletedAt)))
			.limit(1);
		if (!found) throw new Error(`Upload not found: ${u.uploadId}`);

		await db.insert(shareUpload).values({ shareId: created.id, uploadId: u.uploadId });
	}

	// return share with its uploads
	const share = await getShareWithFiles(created.id);
	if (!share) throw new Error('Failed to create share');

	// return a shallow copy without passwordHash to avoid using `delete` on non-optional properties
	const { passwordHash, ...safeShare } = share;
	void passwordHash;
	return safeShare;
}

export async function getShare(shareId: string) {
	const s = await getShareWithFiles(shareId);
	if (!s) return null;

	const { passwordHash, ...safeShare } = s;
	void passwordHash;
	return safeShare;
}

async function getShareWithFiles(shareId: string) {
	const [share] = await db
		.select()
		.from(shares)
		.where(and(eq(shares.id, shareId), isNull(shares.deletedAt)))
		.limit(1);

	if (!share) return null;

	const files = await db
		.select({
			id: uploads.id,
			fingerprint: uploads.fingerprint,
			filename: uploads.filename,
			relativePath: uploads.relativePath,
			size: uploads.size,
			mimeType: uploads.mimeType,
			highSensitivity: uploads.highSensitivity,
			status: uploads.status,
			createdAt: uploads.createdAt
		})
		.from(shareUpload)
		.innerJoin(uploads, eq(shareUpload.uploadId, uploads.id))
		.where(and(eq(shareUpload.shareId, share.id), isNull(uploads.deletedAt)));

	return {
		...share,
		files
	};
}

async function purgeHighSensitivityUploadsForShareIds(shareIds: string[], now: Date) {
	if (shareIds.length === 0) {
		return;
	}

	const rows = await db
		.select({ id: uploads.id, storagePath: uploads.storagePath })
		.from(shareUpload)
		.innerJoin(uploads, eq(shareUpload.uploadId, uploads.id))
		.where(
			and(
				inArray(shareUpload.shareId, shareIds),
				eq(uploads.highSensitivity, true),
				isNull(uploads.deletedAt)
			)
		);

	for (const row of rows) {
		await db.update(uploads).set({ deletedAt: now }).where(eq(uploads.id, row.id));

		if (!row.storagePath) {
			continue;
		}

		const [stillReferenced] = await db
			.select({ id: uploads.id })
			.from(uploads)
			.where(
				and(
					ne(uploads.id, row.id),
					eq(uploads.storagePath, row.storagePath),
					isNull(uploads.deletedAt)
				)
			)
			.limit(1);

		if (stillReferenced) {
			continue;
		}

		await fs.rm(row.storagePath, { force: true }).catch(() => undefined);
	}
}

export async function softDeleteShare(shareId: string) {
	const now = new Date();

	const [updated] = await db
		.update(shares)
		.set({ deletedAt: now, status: 'deleted' })
		.where(eq(shares.id, shareId))
		.returning();

	if (!updated) throw new Error('Share not found');

	await purgeHighSensitivityUploadsForShareIds([shareId], now);

	return { shareId: updated.id, status: updated.status };
}

export async function purgeHighSensitivityUploadsForShares(shareIds: string[], now = new Date()) {
	await purgeHighSensitivityUploadsForShareIds(shareIds, now);
}

export async function listShares() {
	const rows = await db
		.select({
			id: shares.id,
			code: shares.code,
			title: shares.title,
			message: shares.message,
			hideMessageBehindPassword: shares.hideMessageBehindPassword,
			passwordProtected: shares.passwordProtected,
			highSensitivity: shares.highSensitivity,
			expiresAt: shares.expiresAt,
			maxDownloads: shares.maxDownloads,
			downloadCount: shares.downloadCount,
			viewCount: shares.viewCount,
			lastViewedAt: shares.lastViewedAt,
			lastDownloadedAt: shares.lastDownloadedAt,
			createdAt: shares.createdAt,
			uploadCount: sql<number>`count(${shareUpload.uploadId})`
		})
		.from(shares)
		.leftJoin(shareUpload, eq(shareUpload.shareId, shares.id))
		.where(and(isNull(shares.deletedAt), eq(shares.status, 'active')))
		.groupBy(shares.id)
		.orderBy(desc(shares.createdAt));

	return rows.map((row) => ({
		...row,
		uploadCount: Number(row.uploadCount ?? 0)
	}));
}

export async function updateShare(
	shareId: string,
	dto: {
		title?: string | null;
		expiresAt?: string | Date | null;
		password?: string | null;
		message?: string | null;
		hideMessageBehindPassword?: boolean;
		maxDownloads?: number | null;
	}
) {
	const [existing] = await db
		.select({ id: shares.id })
		.from(shares)
		.where(and(eq(shares.id, shareId), isNull(shares.deletedAt)))
		.limit(1);

	if (!existing) {
		throw new Error('Share not found');
	}

	const values: {
		title?: string | null;
		expiresAt?: Date | null;
		passwordHash?: string | null;
		passwordProtected?: boolean;
		message?: string | null;
		hideMessageBehindPassword?: boolean;
		maxDownloads?: number;
	} = {};

	if (dto.title !== undefined) {
		values.title = dto.title;
	}

	if (dto.expiresAt !== undefined) {
		values.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
	}

	if (dto.password !== undefined) {
		if (dto.password && dto.password.length > 0) {
			values.passwordHash = await argon2.hash(dto.password);
			values.passwordProtected = true;
		} else {
			values.passwordHash = null;
			values.passwordProtected = false;
		}
	}

	if (dto.message !== undefined) {
		values.message = dto.message;
	}

	if (dto.hideMessageBehindPassword !== undefined) {
		values.hideMessageBehindPassword = dto.hideMessageBehindPassword;
	}

	if (dto.maxDownloads !== undefined) {
		const parsedMaxDownloads = Number(dto.maxDownloads ?? 0);
		values.maxDownloads = Number.isFinite(parsedMaxDownloads)
			? Math.max(0, Math.floor(parsedMaxDownloads))
			: 0;
	}

	await db.update(shares).set(values).where(eq(shares.id, shareId));

	const updated = await getShare(shareId);
	if (!updated) {
		throw new Error('Share not found');
	}

	return updated;
}

export async function getPublicShareByCode(code: string, password?: string | null) {
	const [share] = await db
		.select()
		.from(shares)
		.where(and(eq(shares.code, code), isNull(shares.deletedAt), eq(shares.status, 'active')))
		.limit(1);

	if (!share) throw new Error('Share not found');
	if (share.expiresAt && new Date(share.expiresAt) < new Date()) throw new Error('Share expired');

	await db
		.update(shares)
		.set({
			viewCount: sql`${shares.viewCount} + 1`,
			lastViewedAt: new Date()
		})
		.where(eq(shares.id, share.id));

	const messageVisibleWithoutPassword = !share.hideMessageBehindPassword;
	const message = messageVisibleWithoutPassword ? share.message : null;

	if (share.passwordProtected) {
		if (!password) {
			return {
				id: share.id,
				code: share.code,
				title: share.title,
				message,
				hideMessageBehindPassword: share.hideMessageBehindPassword,
				expiresAt: share.expiresAt,
				maxDownloads: share.maxDownloads,
				downloadCount: share.downloadCount,
				viewCount: share.viewCount + 1,
				requiresPassword: true,
				highSensitivity: share.highSensitivity,
				uploads: [] as {
					id: string;
					filename: string | null;
					relativePath: string | null;
					size: number;
				}[]
			};
		}

		const matches = share.passwordHash ? await argon2.verify(share.passwordHash, password) : false;
		if (!matches) throw new Error('Invalid password');
	}

	const files = await db
		.select({
			id: uploads.id,
			filename: uploads.filename,
			relativePath: uploads.relativePath,
			size: uploads.size,
			highSensitivity: uploads.highSensitivity
		})
		.from(shareUpload)
		.innerJoin(uploads, eq(shareUpload.uploadId, uploads.id))
		.where(and(eq(shareUpload.shareId, share.id), isNull(uploads.deletedAt)));

	return {
		id: share.id,
		code: share.code,
		title: share.title,
		message: share.message,
		hideMessageBehindPassword: share.hideMessageBehindPassword,
		expiresAt: share.expiresAt,
		maxDownloads: share.maxDownloads,
		downloadCount: share.downloadCount,
		viewCount: share.viewCount + 1,
		requiresPassword: false,
		highSensitivity: share.highSensitivity,
		uploads: files.map((file) => ({
			id: file.id,
			filename: file.filename,
			relativePath: file.relativePath,
			size: Number(file.size ?? 0),
			highSensitivity: file.highSensitivity
		}))
	};
}

async function incrementDownloadIfAllowed(shareId: string) {
	const [updated] = await db
		.update(shares)
		.set({
			downloadCount: sql`${shares.downloadCount} + 1`,
			lastDownloadedAt: new Date()
		})
		.where(
			and(
				eq(shares.id, shareId),
				sql`(${shares.maxDownloads} = 0 OR ${shares.downloadCount} < ${shares.maxDownloads})`
			)
		)
		.returning({ id: shares.id });

	if (updated) return;

	const [state] = await db
		.select({ maxDownloads: shares.maxDownloads, downloadCount: shares.downloadCount })
		.from(shares)
		.where(eq(shares.id, shareId))
		.limit(1);

	if (!state) {
		throw new Error('Share not found');
	}

	if (state.maxDownloads > 0 && state.downloadCount >= state.maxDownloads) {
		throw new Error('Download limit reached');
	}

	throw new Error('Failed to register download');
}

export async function createShareDownloadGrant(code: string, password?: string | null) {
	const share = await getPublicShareByCode(code, password);
	if (share.requiresPassword) throw new Error('Password required');

	await incrementDownloadIfAllowed(share.id);

	const downloadUrls: { uploadId: string; url: string }[] = [];
	let firstToken: string | null = null;

	for (const upload of share.uploads) {
		const { jwt } = await generateDownloadToken(
			{ shareId: share.id, shareUploadId: upload.id },
			undefined
		);
		if (!firstToken) {
			firstToken = jwt;
		}

		downloadUrls.push({
			uploadId: upload.id,
			url: `/api/v1/uploads/${upload.id}?token=${encodeURIComponent(jwt)}`
		});
	}

	return {
		token: firstToken,
		downloadUrls
	};
}

export async function createShareZipDownload(code: string, password?: string | null) {
	const share = await getPublicShareByCode(code, password);
	if (share.requiresPassword) throw new Error('Password required');

	const rows = await db
		.select({
			id: uploads.id,
			filename: uploads.filename,
			storagePath: uploads.storagePath
		})
		.from(shareUpload)
		.innerJoin(uploads, eq(shareUpload.uploadId, uploads.id))
		.where(and(eq(shareUpload.shareId, share.id), isNull(uploads.deletedAt)));

	if (rows.length === 0) {
		throw new Error('No files available to download');
	}

	const files: Record<string, Uint8Array> = {};
	const filenameCounts = new Map<string, number>();

	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const original = toSafeFilename(row.filename, `file-${i + 1}.bin`);
		const seen = filenameCounts.get(original) ?? 0;
		filenameCounts.set(original, seen + 1);
		const finalName = seen === 0 ? original : `${seen + 1}-${original}`;

		if (!row.storagePath) {
			files[finalName] = new Uint8Array();
			continue;
		}

		const content = await fs.readFile(row.storagePath);
		files[finalName] = new Uint8Array(content);
	}

	const zip = zipSync(files, { level: 6 });

	await incrementDownloadIfAllowed(share.id);

	return {
		filename: `${share.code}.zip`,
		content: zip
	};
}
