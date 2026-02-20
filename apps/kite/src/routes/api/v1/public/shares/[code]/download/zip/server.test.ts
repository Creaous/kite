import { describe, expect, it } from 'vitest';
import { POST } from './+server';
import { appendChunk, initiateUpload } from '$lib/server/services/upload';
import { createShare } from '$lib/server/services/share';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('POST /api/v1/public/shares/:code/download/zip', () => {
	it('returns a zip archive for all files in a share', async () => {
		const uploaded = await initiateUpload({
			filename: 'zip-download.txt',
			size: 7,
			fingerprint: 'fp-public-zip-download-1'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('zipfile').buffer);

		const share = await createShare({
			title: 'Zip Share',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/zip');
		expect(res.headers.get('content-disposition')).toContain(`${share.code}.zip`);
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.byteLength).toBeGreaterThan(20);
	});

	it('returns 401 when zip download is requested for protected share without password', async () => {
		const uploaded = await initiateUpload({
			filename: 'zip-download-protected.txt',
			size: 7,
			fingerprint: 'fp-public-zip-download-protected-1'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('zipfile').buffer);

		const share = await createShare({
			title: 'Zip Share Protected',
			password: 'zip-secret',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('returns zip when valid password is supplied for protected share', async () => {
		const uploaded = await initiateUpload({
			filename: 'zip-download-protected-valid.txt',
			size: 7,
			fingerprint: 'fp-public-zip-download-protected-2'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('zipfile').buffer);

		const share = await createShare({
			title: 'Zip Share Protected Valid',
			password: 'zip-secret-valid',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: { password: 'zip-secret-valid' }
			}) as never
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/zip');
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.byteLength).toBeGreaterThan(20);
	});

	it('returns 401 when invalid password is supplied for protected share zip', async () => {
		const uploaded = await initiateUpload({
			filename: 'zip-download-protected-invalid.txt',
			size: 7,
			fingerprint: 'fp-public-zip-download-protected-3'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('zipfile').buffer);

		const share = await createShare({
			title: 'Zip Share Protected Invalid',
			password: 'zip-secret-invalid',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: { password: 'wrong-password' }
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('returns 403 when zip download limit has been reached', async () => {
		const uploaded = await initiateUpload({
			filename: 'zip-limit.txt',
			size: 7,
			fingerprint: 'fp-public-zip-download-limit-1'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('zipfile').buffer);

		const share = await createShare({
			title: 'Zip Share Limited',
			maxDownloads: 1,
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const first = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: {}
			}) as never
		);
		expect(first.status).toBe(200);

		const second = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/zip`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(second.status).toBe(403);
	});
});
