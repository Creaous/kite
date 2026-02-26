import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
	const sendMailMock = vi.fn();
	const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
	return { sendMailMock, createTransportMock };
});

vi.mock('nodemailer', () => ({
	default: {
		createTransport: createTransportMock
	}
}));

import { isEmailConfigured, resetEmailTransportForTests, sendEmail } from './email';

describe('email service', () => {
	const originalEnv = {
		host: process.env.SMTP_HOST,
		port: process.env.SMTP_PORT,
		secure: process.env.SMTP_SECURE,
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
		from: process.env.SMTP_FROM
	};

	beforeEach(() => {
		process.env.SMTP_HOST = 'smtp.example.com';
		process.env.SMTP_PORT = '587';
		process.env.SMTP_SECURE = 'false';
		process.env.SMTP_USER = 'smtp-user';
		process.env.SMTP_PASS = 'smtp-pass';
		process.env.SMTP_FROM = 'Kite <noreply@example.com>';
		sendMailMock.mockReset();
		createTransportMock.mockClear();
		resetEmailTransportForTests();
	});

	afterEach(() => {
		process.env.SMTP_HOST = originalEnv.host;
		process.env.SMTP_PORT = originalEnv.port;
		process.env.SMTP_SECURE = originalEnv.secure;
		process.env.SMTP_USER = originalEnv.user;
		process.env.SMTP_PASS = originalEnv.pass;
		process.env.SMTP_FROM = originalEnv.from;
		resetEmailTransportForTests();
	});

	it('reports configured SMTP when all required env vars exist', () => {
		expect(isEmailConfigured()).toBe(true);
	});

	it('returns false when SMTP configuration is incomplete', () => {
		delete process.env.SMTP_FROM;
		expect(isEmailConfigured()).toBe(false);
	});

	it('returns false when SMTP port is invalid', () => {
		process.env.SMTP_PORT = 'abc';
		expect(isEmailConfigured()).toBe(false);
	});

	it('sends email with default from and formatted recipients', async () => {
		sendMailMock.mockResolvedValueOnce({
			accepted: ['alice@example.com'],
			rejected: []
		});

		const result = await sendEmail({
			to: { name: 'Alice', email: ' ALICE@example.com ' },
			subject: 'Hello',
			text: 'Plain text',
			html: '<p>HTML</p>'
		});

		expect(createTransportMock).toHaveBeenCalledWith({
			host: 'smtp.example.com',
			port: 587,
			secure: false,
			auth: {
				user: 'smtp-user',
				pass: 'smtp-pass'
			}
		});
		expect(sendMailMock).toHaveBeenCalledWith({
			from: 'Kite <noreply@example.com>',
			to: ['"Alice" <alice@example.com>'],
			subject: 'Hello',
			text: 'Plain text',
			html: '<p>HTML</p>'
		});
		expect(result).toEqual({
			accepted: ['alice@example.com'],
			rejected: []
		});
	});

	it('sends to multiple recipients and supports custom from', async () => {
		sendMailMock.mockResolvedValueOnce({
			accepted: ['a@example.com', 'b@example.com'],
			rejected: []
		});

		await sendEmail({
			to: [{ email: 'a@example.com' }, { name: 'Bob', email: 'b@example.com' }],
			from: 'Custom <custom@example.com>',
			subject: 'Hello all'
		});

		expect(sendMailMock).toHaveBeenCalledWith(
			expect.objectContaining({
				from: 'Custom <custom@example.com>',
				to: ['a@example.com', '"Bob" <b@example.com>'],
				subject: 'Hello all'
			})
		);
	});

	it('reuses transport between calls', async () => {
		sendMailMock.mockResolvedValue({ accepted: [], rejected: [] });

		await sendEmail({ to: { email: 'one@example.com' }, subject: 'One' });
		await sendEmail({ to: { email: 'two@example.com' }, subject: 'Two' });

		expect(createTransportMock).toHaveBeenCalledTimes(1);
		expect(sendMailMock).toHaveBeenCalledTimes(2);
	});

	it('throws when SMTP is not configured', async () => {
		delete process.env.SMTP_HOST;

		await expect(
			sendEmail({ to: { email: 'to@example.com' }, subject: 'No SMTP' })
		).rejects.toThrow('SMTP is not configured');
	});

	it('throws when no recipients are provided', async () => {
		await expect(sendEmail({ to: [], subject: 'No recipients' })).rejects.toThrow(
			'At least one recipient is required'
		);
	});

	it('throws when recipient email is blank', async () => {
		await expect(sendEmail({ to: { email: '   ' }, subject: 'Bad recipient' })).rejects.toThrow(
			'Recipient email is required'
		);
	});
});
