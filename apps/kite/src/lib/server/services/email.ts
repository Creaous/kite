import nodemailer from 'nodemailer';

export type EmailRecipient = {
	name?: string | null;
	email: string;
};

export type SendEmailPayload = {
	to: EmailRecipient | EmailRecipient[];
	subject: string;
	text?: string;
	html?: string;
	from?: string;
};

export type SendEmailResult = {
	accepted: string[];
	rejected: string[];
};

type SmtpConfig = {
	host: string;
	port: number;
	secure: boolean;
	user: string;
	pass: string;
	from: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getSmtpConfig(): SmtpConfig | null {
	const host = process.env.SMTP_HOST?.trim();
	const portRaw = process.env.SMTP_PORT?.trim();
	const user = process.env.SMTP_USER?.trim();
	const pass = process.env.SMTP_PASS?.trim();
	const from = process.env.SMTP_FROM?.trim();

	if (!host || !portRaw || !user || !pass || !from) {
		return null;
	}

	const port = Number.parseInt(portRaw, 10);
	if (!Number.isFinite(port) || port <= 0) {
		return null;
	}

	const secure = process.env.SMTP_SECURE === 'true' || port === 465;

	return {
		host,
		port,
		secure,
		user,
		pass,
		from
	};
}

function getTransporter() {
	const config = getSmtpConfig();
	if (!config) {
		throw new Error('SMTP is not configured');
	}

	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: {
				user: config.user,
				pass: config.pass
			}
		});
	}

	return { transporter, config };
}

function formatRecipient(recipient: EmailRecipient) {
	const email = recipient.email.trim().toLowerCase();
	const name = recipient.name?.trim();
	if (!email) {
		throw new Error('Recipient email is required');
	}

	if (!name) {
		return email;
	}

	return `"${name.replace(/"/g, '\\"')}" <${email}>`;
}

export function isEmailConfigured() {
	return getSmtpConfig() !== null;
}

export async function sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
	const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
	if (recipients.length === 0) {
		throw new Error('At least one recipient is required');
	}

	const { transporter, config } = getTransporter();
	const to = recipients.map((recipient) => formatRecipient(recipient));

	const result = await transporter.sendMail({
		from: payload.from?.trim() || config.from,
		to,
		subject: payload.subject,
		text: payload.text,
		html: payload.html
	});

	return {
		accepted: Array.isArray(result.accepted) ? result.accepted.map(String) : [],
		rejected: Array.isArray(result.rejected) ? result.rejected.map(String) : []
	};
}

export function resetEmailTransportForTests() {
	transporter = null;
}
