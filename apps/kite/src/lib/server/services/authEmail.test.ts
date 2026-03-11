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
	isAuthEmailConfigured,
	resetAuthMailerForTests,
	sendPasswordResetEmail,
	sendVerificationEmail
} from './authEmail';

describe('authEmail service', () => {
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
		expect(isAuthEmailConfigured()).toBe(true);
	});

	it('returns false when generic email service is not configured', () => {
		isEmailConfiguredMock.mockReturnValueOnce(false);
		expect(isAuthEmailConfigured()).toBe(false);
	});

	it('sends reset password email with text and html', async () => {
		sendEmailMock.mockResolvedValueOnce({ accepted: ['to@example.com'], rejected: [] });

		await sendPasswordResetEmail(
			{ name: 'Alice', email: ' TO@example.com ' },
			'https://kite.example.com/reset-password?token=abc'
		);

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
			to: { email: 'to@example.com', name: 'Alice' },
			subject: 'Reset your Kite password'
		});
		expect(sendEmailMock.mock.calls[0][0].text).toContain('Hi Alice,');
		expect(sendEmailMock.mock.calls[0][0].text).toContain(
			'Reset password: https://kite.example.com/reset-password?token=abc'
		);
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Hi Alice');
		expect(sendEmailMock.mock.calls[0][0].html).toContain(
			'https://kite.example.com/images/logo.png'
		);
	});

	it('sends verification email with text and html', async () => {
		sendEmailMock.mockResolvedValueOnce({ accepted: ['to@example.com'], rejected: [] });

		await sendVerificationEmail(
			{ email: 'to@example.com' },
			'https://kite.example.com/verify-email?token=xyz'
		);

		expect(sendEmailMock).toHaveBeenCalledTimes(1);
		expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
			to: { email: 'to@example.com', name: undefined },
			subject: 'Verify your Kite email'
		});
		expect(sendEmailMock.mock.calls[0][0].text).toContain('Verify email:');
		expect(sendEmailMock.mock.calls[0][0].text).toContain(
			'https://kite.example.com/verify-email?token=xyz'
		);
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Verify email address');
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

		await sendVerificationEmail(
			{ email: 'to@example.com' },
			'https://kite.example.com/verify-email?token=xyz'
		);

		expect(sendEmailMock.mock.calls[0][0].subject).toContain('Acme Files');
		expect(sendEmailMock.mock.calls[0][0].html).toContain('Acme Files');
		expect(sendEmailMock.mock.calls[0][0].html).toContain(
			'https://kite.example.com/branding/logo.svg'
		);
	});

	it('resets generic transport in tests helper', () => {
		resetAuthMailerForTests();
		expect(resetEmailTransportForTestsMock).toHaveBeenCalledTimes(1);
	});
});
