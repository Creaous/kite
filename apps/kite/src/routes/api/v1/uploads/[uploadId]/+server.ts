import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { appendChunk } from '$lib/server/services/upload';
import { consumeToken, verifyToken } from '$lib/server/services/token';
import { db } from '$lib/server/db';
import { shareUpload, uploads } from '$lib/server/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { promises as fs } from 'node:fs';
import { includesInternalError } from '$lib/server/api-errors';
import { requireAuthenticatedUser } from '$lib/server/http-auth';

const DEFAULT_MAX_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

function getMaxUploadChunkBytes() {
	const value = Number(process.env.MAX_UPLOAD_CHUNK_BYTES);
	if (!Number.isFinite(value) || value <= 0) {
		return DEFAULT_MAX_UPLOAD_CHUNK_BYTES;
	}

	return Math.floor(value);
}

function toSafeFilename(filename: string | null | undefined, fallback: string) {
	const source = filename?.trim() || fallback;
	return source.replace(/[\\/\r\n\0]/g, '_');
}

export const GET: RequestHandler = async ({ params, url }) => {
	const { uploadId } = params;
	const token = url.searchParams.get('token');

	if (!uploadId || !token) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'uploadId and token are required' } },
			{ status: 400 }
		);
	}

	try {
		const verified = await verifyToken(token);

		if (verified.token.purpose !== 'download') {
			return json(
				{ error: { code: 'INVALID_TOKEN', message: 'Token is not valid for downloads' } },
				{ status: 401 }
			);
		}

		const shareId = verified.payload.shareId;
		const shareUploadId = verified.payload.shareUploadId;

		if (!shareId || !shareUploadId || shareUploadId !== uploadId) {
			return json(
				{ error: { code: 'INVALID_TOKEN', message: 'Token is not valid for downloads' } },
				{ status: 401 }
			);
		}

		const [row] = await db
			.select({
				id: uploads.id,
				filename: uploads.filename,
				mimeType: uploads.mimeType,
				storagePath: uploads.storagePath
			})
			.from(shareUpload)
			.innerJoin(uploads, eq(shareUpload.uploadId, uploads.id))
			.where(
				and(eq(shareUpload.shareId, shareId), eq(uploads.id, uploadId), isNull(uploads.deletedAt))
			)
			.limit(1);

		if (!row) {
			return json(
				{ error: { code: 'NOT_FOUND', message: 'Upload not found in share' } },
				{ status: 404 }
			);
		}

		if (!row.storagePath) {
			return json(
				{ error: { code: 'DOWNLOAD_UNAVAILABLE', message: 'Upload content is unavailable' } },
				{ status: 404 }
			);
		}

		const content = await fs.readFile(row.storagePath);
		await consumeToken(token);
		const filename = toSafeFilename(row.filename, `${row.id}.bin`);

		return new Response(content, {
			status: 200,
			headers: {
				'content-type': row.mimeType || 'application/octet-stream',
				'content-disposition': `attachment; filename="${filename}"`,
				'content-length': String(content.byteLength),
				'x-content-type-options': 'nosniff',
				'cache-control': 'private, no-store'
			}
		});
	} catch (err) {
		const statusFromError =
			typeof err === 'object' && err !== null && 'status' in err
				? Number((err as { status?: unknown }).status)
				: null;

		const status =
			statusFromError === 401 ||
			includesInternalError(err, 'token') ||
			includesInternalError(err, 'revoked') ||
			includesInternalError(err, 'expired') ||
			includesInternalError(err, 'not found') ||
			includesInternalError(err, 'invalid')
				? 401
				: 500;
		return json(
			{ error: { code: 'UPLOAD_DOWNLOAD_FAILED', message: 'Failed to download file' } },
			{ status }
		);
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const unauthorized = requireAuthenticatedUser(locals);
	if (unauthorized) return unauthorized;

	const { uploadId } = params;

	if (!uploadId) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'uploadId is required' } },
			{ status: 400 }
		);
	}

	try {
		const chunk = await request.arrayBuffer();
		const maxUploadChunkBytes = getMaxUploadChunkBytes();
		if (chunk.byteLength === 0 || chunk.byteLength > maxUploadChunkBytes) {
			return json(
				{
					error: {
						code: 'INVALID_CHUNK_SIZE',
						message: `Upload chunk must be between 1 and ${maxUploadChunkBytes} bytes`
					}
				},
				{ status: 413 }
			);
		}

		const data = await appendChunk(uploadId, chunk, {
			userId: locals.user!.id,
			isAdmin: locals.user?.role === 'admin'
		});
		return json({ data }, { status: 200 });
	} catch (err) {
		const status = includesInternalError(err, 'not found')
			? 404
			: includesInternalError(err, 'forbidden')
				? 403
				: 500;
		return json(
			{ error: { code: 'UPLOAD_CHUNK_FAILED', message: 'Failed to append upload chunk' } },
			{ status }
		);
	}
};
