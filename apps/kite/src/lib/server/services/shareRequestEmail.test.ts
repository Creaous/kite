import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isEmailConfiguredMock, sendEmailMock, resetEmailTransportForTestsMock } = vi.hoisted(() => {
	const isEmailConfiguredMock = vi.fn();
	const sendEmailMock = vi.fn();
	const resetEmailTransportForTestsMock = vi.fn();
	return { isEmailConfiguredMock, sendEmailMock, resetEmailTransportForTestsMock };
});

const { getBrandingSettingsMock } = vi.hoisted(() => {
	const getBrandingSettingsMock = vi.fn();
	return { getBrandingSettingsMock };
});

vi.mock('./email', () => ({
	isEmailConfigured: isEmailConfiguredMock,
	sendEmail: sendEmailMock,
	resetEmailTransportForTests: resetEmailTransportForTestsMock
}));

vi.mock('./settings', () => ({
	getBrandingSettings: getBrandingSettingsMock
}));

import {
	isShareRequestEmailConfigured,
	resetShareRequestMailerForTests,
	sendShareRequestEmail
} from './shareRequestEmail';

describe('shareRequestEmail service', () => {
	beforeEach(() => {
		getBrandingSettingsMock.mockResolvedValue({
			appName: 'Kite',
			tagline: '',
			logoUrl: '',
			faviconUrl: '',
			disableIndexing: true
		});
	});

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
		expect(sendEmailMock.mock.calls[0][0].text).toContain('File request details:');
		expect(sendEmailMock.mock.calls[0][0].text).toContain('- Code: ABC123');
		expect(sendEmailMock.mock.calls[0][0].text).toContain('View request: https://kite.example.com/r/ABC123');
		expect(sendEmailMock.mock.calls[0][0].text).toContain(
			"If you weren't expecting this, you can safely ignore this email."
		);
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Hi Alice');
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Kite');
		expect(sendEmailMock.mock.calls[0][0].html).toContain('https://kite.example.com/images/logo.png');
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

	it('uses configured branding logo URL and app name in HTML', async () => {
		getBrandingSettingsMock.mockResolvedValueOnce({
			appName: 'Acme Files',
			tagline: 'Secure transfers',
			logoUrl: '/branding/logo.svg',
			faviconUrl: '',
			disableIndexing: true
		});
		sendEmailMock.mockResolvedValueOnce({ accepted: ['to@example.com'], rejected: [] });

		await sendShareRequestEmail({
			recipients: [{ email: 'to@example.com' }],
			requestUrl: 'https://kite.example.com/r/ABC123',
			shareRequest: {
				code: 'ABC123',
				title: 'Upload docs',
				message: null,
				requesterName: null,
				requesterEmail: null
			}
		});

		expect(sendEmailMock.mock.calls[0][0].html).toContain('Acme Files');
		expect(sendEmailMock.mock.calls[0][0].html).toContain('https://kite.example.com/branding/logo.svg');
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
