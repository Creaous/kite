import { describe, expect, it } from 'vitest';

import {
	createAuditLogEvent,
	getClientIpAddress,
	listAuditLogEvents,
	toAuditHttpPayload
} from './audit';

describe('audit service', () => {
	it('creates and lists audit log entries', async () => {
		await createAuditLogEvent({
			action: 'share.created',
			actorId: 'test-user-id',
			resourceType: 'share',
			resourceId: 'share-123',
			payload: toAuditHttpPayload({
				requestId: 'req-1',
				method: 'POST',
				path: '/api/v1/shares',
				status: 201,
				durationMs: 8.5,
				ipAddress: '127.0.0.1',
				userAgent: 'vitest',
				query: null,
				isSubRequest: false
			})
		});

		const result = await listAuditLogEvents({ limit: 10, offset: 0, actionLike: 'share.' });
		expect(result.total).toBeGreaterThan(0);
		expect(result.logs.some((entry) => entry.action === 'share.created')).toBe(true);
	});

	it('prefers direct client address when proxy trust is disabled', () => {
		const ip = getClientIpAddress({
			headers: new Headers({
				'x-forwarded-for': '203.0.113.7, 10.0.0.1',
				'x-real-ip': '198.51.100.10'
			}),
			getClientAddress: () => '127.0.0.1'
		});

		expect(ip).toBe('127.0.0.1');
	});

	it('resolves client ip from proxy headers when proxy trust is enabled', () => {
		const ip = getClientIpAddress({
			headers: new Headers({
				'x-forwarded-for': '203.0.113.7, 10.0.0.1',
				'x-real-ip': '198.51.100.10'
			}),
			getClientAddress: () => '127.0.0.1',
			trustProxy: true
		});

		expect(ip).toBe('203.0.113.7');
	});

	it('redacts sensitive fields in request and response snapshots', () => {
		const payload = toAuditHttpPayload({
			requestId: 'req-sensitive',
			method: 'POST',
			path: '/api/v1/shares',
			status: 201,
			durationMs: 3,
			ipAddress: '127.0.0.1',
			userAgent: 'vitest',
			requestBody: {
				title: 'Quarterly docs',
				password: 'super-secret',
				nested: {
					token: 'abc'
				}
			},
			responseBody: {
				data: {
					id: 'share-123',
					passwordHash: 'hash-value'
				}
			}
		});

		expect((payload.request as { body: { password: string } }).body.password).toBe('[REDACTED]');
		expect((payload.request as { body: { nested: { token: string } } }).body.nested.token).toBe(
			'[REDACTED]'
		);
		expect(
			(
				payload.response as {
					body: { data: { passwordHash: string } };
				}
			).body.data.passwordHash
		).toBe('[REDACTED]');
	});
});
