import { describe, expect, it } from 'vitest';
import { POST } from './+server';
import { initiateUpload } from '$lib/server/services/upload';
import { createShare } from '$lib/server/services/share';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('POST /api/v1/public/shares/:code/download', () => {
	it('creates download token and URLs', async () => {
		const uploaded = await initiateUpload({
			filename: 'public-download.txt',
			size: 18,
			fingerprint: 'fp-public-download-1'
		});
		const share = await createShare({
			title: 'Download Share',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.token).toBeDefined();
		expect(Array.isArray(body.data.downloadUrls)).toBe(true);
	});

	it('returns 401 when protected share download is requested without password', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-download.txt',
			size: 12,
			fingerprint: 'fp-public-download-protected-1'
		});
		const share = await createShare({
			title: 'Protected Download Share',
			password: 'download-secret',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('creates download token when valid password is supplied', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-download-valid.txt',
			size: 12,
			fingerprint: 'fp-public-download-protected-2'
		});
		const share = await createShare({
			title: 'Protected Download Share Valid',
			password: 'download-secret-valid',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: { password: 'download-secret-valid' }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.token).toBeDefined();
		expect(body.data.downloadUrls.length).toBeGreaterThan(0);
	});

	it('returns 401 when invalid password is supplied', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-download-invalid.txt',
			size: 12,
			fingerprint: 'fp-public-download-protected-3'
		});
		const share = await createShare({
			title: 'Protected Download Share Invalid',
			password: 'download-secret-invalid',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: { password: 'wrong-password' }
			}) as never
		);

		expect(res.status).toBe(401);
	});

	it('returns 403 when max download limit has been reached', async () => {
		const uploaded = await initiateUpload({
			filename: 'limited-download.txt',
			size: 12,
			fingerprint: 'fp-public-download-limit-1'
		});
		const share = await createShare({
			title: 'Limited Download Share',
			maxDownloads: 1,
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const first = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: {}
			}) as never
		);
		expect(first.status).toBe(200);

		const second = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(second.status).toBe(403);
	});
});
