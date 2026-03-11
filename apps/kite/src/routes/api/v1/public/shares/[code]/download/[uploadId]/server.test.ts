import { describe, expect, it } from 'vitest';

import { appendChunk, initiateUpload } from '$lib/server/services/upload';
import { createShare } from '$lib/server/services/share';
import { createRequestEvent } from '$lib/server/test/request-event';
import { POST } from './+server';

describe('POST /api/v1/public/shares/:code/download/:uploadId', () => {
	it('returns binary download headers for successful file download', async () => {
		const uploaded = await initiateUpload({
			filename: 'direct-download.txt',
			size: 12,
			fingerprint: 'fp-public-direct-download-1'
		});

		await appendChunk(uploaded.uploadId, new TextEncoder().encode('hello world!').buffer);

		const share = await createShare({
			title: 'Direct Download Share',
			uploads: [{ uploadId: uploaded.uploadId }]
		});

		const res = await POST(
			createRequestEvent({
				method: 'POST',
				path: `/api/v1/public/shares/${share.code}/download/${uploaded.uploadId}`,
				params: { code: share.code, uploadId: uploaded.uploadId },
				body: {}
			}) as never
		);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-disposition')).toContain('direct-download.txt');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('cache-control')).toBe('private, no-store');
	});
});
