import { describe, expect, it } from 'vitest';
import { GET, POST } from './+server';
import { initiateUpload } from '$lib/server/services/upload';
import { finalizeUpload } from '$lib/server/services/upload';
import { createRequestEvent } from '$lib/server/test/request-event';

describe('GET/POST /api/v1/shares', () => {
	it('lists shares for authenticated users', async () => {
		const created = await initiateUpload({
			filename: 'list-shared.txt',
			size: 10,
			fingerprint: 'fp-api-share-list-1'
		});
		await finalizeUpload(created.uploadId, 'finalize');

		await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/shares',
				authenticated: true,
				body: {
					title: 'My Listed Share',
					uploads: [{ uploadId: created.uploadId }]
				}
			}) as never
		);

		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/shares',
				authenticated: true
			}) as never
		);

		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Array.isArray(body.data)).toBe(true);
	});

	it('returns 401 for unauthenticated users on list', async () => {
		const res = await GET(
			createRequestEvent({
				method: 'GET',
				path: '/api/v1/shares',
				authenticated: false
			}) as never
		);

		expect(res.status).toBe(401);
		const body = await res.json();
		expect(body.error.code).toBe('UNAUTHORIZED');
	});

	it('creates a share from uploads', async () => {
		const created = await initiateUpload({
			filename: 'shared.txt',
			size: 10,
			fingerprint: 'fp-api-share-1'
		});
		await finalizeUpload(created.uploadId, 'finalize');

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/shares',
				authenticated: true,
				body: {
					title: 'My API Share',
					uploads: [{ uploadId: created.uploadId }]
				}
			}) as never
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.data.id).toBeDefined();
		expect(body.data.code).toBeDefined();
	});

	it('creates a high sensitivity share from uploads', async () => {
		const created = await initiateUpload({
			filename: 'shared-high-sensitivity.txt',
			size: 10,
			fingerprint: 'fp-api-share-hs-1',
			highSensitivity: true
		});
		await finalizeUpload(created.uploadId, 'finalize');

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/shares',
				authenticated: true,
				body: {
					title: 'My API High Sensitivity Share',
					highSensitivity: true,
					uploads: [{ uploadId: created.uploadId }]
				}
			}) as never
		);

		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.data.highSensitivity).toBe(true);
	});

	it('returns 400 when uploads are missing', async () => {
		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: '/api/v1/shares',
				authenticated: true,
				body: {
					title: 'Invalid Share',
					uploads: []
				}
			}) as never
		);

		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body.error.code).toBe('INVALID_INPUT');
	});
});
