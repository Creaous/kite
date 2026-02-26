import { afterEach, describe, expect, it, vi } from 'vitest';

const { isEmailConfiguredMock, sendEmailMock, resetEmailTransportForTestsMock } = vi.hoisted(() => {
	const isEmailConfiguredMock = vi.fn();
	const sendEmailMock = vi.fn();
	const resetEmailTransportForTestsMock = vi.fn();
	return { isEmailConfiguredMock, sendEmailMock, resetEmailTransportForTestsMock };
});

vi.mock('./email', () => ({
	isEmailConfigured: isEmailConfiguredMock,
	sendEmail: sendEmailMock,
	resetEmailTransportForTests: resetEmailTransportForTestsMock
}));

import {
	isShareRequestEmailConfigured,
	resetShareRequestMailerForTests,
	sendShareRequestEmail
} from './shareRequestEmail';

describe('shareRequestEmail service', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('delegates SMTP configured check to generic email service', () => {
		isEmailConfiguredMock.mockReturnValueOnce(true);
		expect(isShareRequestEmailConfigured()).toBe(true);
	});

	it('returns false when generic email service is not configured', () => {
		isEmailConfiguredMock.mockReturnValueOnce(false);
		expect(isShareRequestEmailConfigured()).toBe(false);
	});

	it('sends share request email to recipients', async () => {
		sendEmailMock
			.mockResolvedValueOnce({
				accepted: ['to1@example.com'],
				rejected: []
			})
			.mockResolvedValueOnce({
				accepted: [],
				rejected: ['to2@example.com']
			});

		const result = await sendShareRequestEmail({
			recipients: [{ name: 'Alice', email: 'to1@example.com' }, { email: 'to2@example.com' }],
			requestUrl: 'https://kite.example.com/r/ABC123',
			shareRequest: {
				code: 'ABC123',
				title: 'Upload tax docs',
				message: 'Please upload before Friday',
				requesterName: 'Finance',
				requesterEmail: 'finance@example.com'
			}
		});

		expect(sendEmailMock).toHaveBeenCalledTimes(2);
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
			to: { email: 'to1@example.com', name: 'Alice' },
			subject: 'File request: Upload tax docs'
		});
		expect(sendEmailMock.mock.calls[0][0].text).toContain('Hi Alice,');
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Hi Alice');
		expect(sendEmailMock.mock.calls[1][0]).toMatchObject({
			to: { email: 'to2@example.com', name: undefined },
			subject: 'File request: Upload tax docs'
		});
		expect(result).toEqual({
			accepted: ['to1@example.com'],
			rejected: ['to2@example.com']
		});
	});

	it('uses request code in subject when title is empty', async () => {
		sendEmailMock.mockResolvedValueOnce({ accepted: ['to@example.com'], rejected: [] });

		await expect(
			sendShareRequestEmail({
				recipients: [{ email: 'to@example.com' }],
				requestUrl: 'https://kite.example.com/r/ABC123',
				shareRequest: {
					code: 'ABC123',
					title: null,
					message: null,
					requesterName: null,
					requesterEmail: null
				}
			})
		).resolves.toEqual({ accepted: ['to@example.com'], rejected: [] });

		expect(sendEmailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				subject: 'File request: ABC123'
			})
		);
	});

	it('throws when recipients are empty', async () => {
		await expect(
			sendShareRequestEmail({
				recipients: [],
				requestUrl: 'https://kite.example.com/r/ABC123',
				shareRequest: {
					code: 'ABC123',
					title: null,
					message: null,
					requesterName: null,
					requesterEmail: null
				}
			})
		).rejects.toThrow('At least one recipient is required');
	});

	it('resets generic transport in tests helper', () => {
		resetShareRequestMailerForTests();
		expect(resetEmailTransportForTestsMock).toHaveBeenCalledTimes(1);
	});
});
