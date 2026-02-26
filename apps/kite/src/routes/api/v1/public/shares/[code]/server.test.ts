import { describe, expect, it } from 'vitest';
import { GET, POST } from './+server';
import { initiateUpload } from '$lib/server/services/upload';
import { createShare } from '$lib/server/services/share';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('GET /api/v1/public/shares/:code', () => {
	it('returns public share metadata', async () => {
		const uploaded = await initiateUpload({
			filename: 'public-share.txt',
			size: 8,
			fingerprint: 'fp-public-share-1'
		});
		const share = await createShare({
			title: 'Public Share',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.code).toBe(share.code);
		expect(Array.isArray(body.data.uploads)).toBe(true);
		expect(typeof body.data.viewCount).toBe('number');
		expect(typeof body.data.downloadCount).toBe('number');
	});

	it('returns requiresPassword when share is protected and no password is supplied', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-share.txt',
			size: 8,
			fingerprint: 'fp-public-share-protected-1'
		});
		const share = await createShare({
			title: 'Protected Share',
			password: 'secret-123',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.requiresPassword).toBe(true);
		expect(body.data.uploads).toEqual([]);
	});

	it('shows share message without password when configured', async () => {
		const uploaded = await initiateUpload({
			filename: 'message-visible.txt',
			size: 8,
			fingerprint: 'fp-public-share-message-visible-1'
		});
		const share = await createShare({
			title: 'Protected message visible',
			password: 'visible-secret',
			message: 'Visible without password',
			hideMessageBehindPassword: false,
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.requiresPassword).toBe(true);
		expect(body.data.message).toBe('Visible without password');
	});

	it('hides share message behind password when configured', async () => {
		const uploaded = await initiateUpload({
			filename: 'message-hidden.txt',
			size: 8,
			fingerprint: 'fp-public-share-message-hidden-1'
		});
		const share = await createShare({
			title: 'Protected message hidden',
			password: 'hidden-secret',
			message: 'Should stay hidden',
			hideMessageBehindPassword: true,
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.requiresPassword).toBe(true);
		expect(body.data.message).toBeNull();
	});

	it('returns 401 when an invalid password is supplied via POST', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-share-invalid-pass.txt',
			size: 8,
			fingerprint: 'fp-public-share-protected-2'
		});
		const share = await createShare({
			title: 'Protected Share Invalid Password',
			password: 'secret-456',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code },
				body: { password: 'bad-password' }
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_PASSWORD');
	});

	it('returns uploads when a valid password is supplied via POST', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-share-valid-pass.txt',
			size: 8,
			fingerprint: 'fp-public-share-protected-3'
		});
		const share = await createShare({
			title: 'Protected Share Valid Password',
			password: 'secret-789',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code },
				body: { password: 'secret-789' }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.requiresPassword).toBe(false);
		expect(body.data.uploads.length).toBeGreaterThan(0);
	});

	it('returns 400 when POST unlock is called without password', async () => {
		const uploaded = await initiateUpload({
			filename: 'protected-share-missing-pass.txt',
			size: 8,
			fingerprint: 'fp-public-share-protected-4'
		});
		const share = await createShare({
			title: 'Protected Share Missing Password',
			password: 'secret-000',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code },
				body: {}
			}) as never
		);

		expect(res.status).toBe(400);
	});

	it('returns nested upload relative paths for tree rendering', async () => {
		const uploaded = await initiateUpload({
			filename: 'nested.txt',
			relativePath: 'root/folder/nested.txt',
			size: 8,
			fingerprint: 'fp-public-share-nested-1'
		});
		const share = await createShare({
			title: 'Nested Share',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: `/api/v1/public/shares/${share.code}`,
				params: { code: share.code }
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data.uploads[0].relativePath).toBe('root/folder/nested.txt');
	});
});
