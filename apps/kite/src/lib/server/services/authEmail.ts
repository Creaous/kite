import fs from 'node:fs/promises';
import path from 'node:path';

import { isEmailConfigured, resetEmailTransportForTests, sendEmail } from './email';
import { getBrandingSettings } from './settings';

type AuthEmailRecipient = {
	name?: string | null;
	email: string;
};

type AuthEmailBranding = {
	name: string;
	logoSrc: string;
};

const templateCache = new Map<string, string>();

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function renderTemplateVariables(
	template: string,
	values: Record<string, string | null | undefined>
): string {
	return template.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, key: string) => {
		const value = values[key];
		return value ? escapeHtml(value) : '';
	});
}

async function resolveTemplatePath(templateName: string) {
	const envDir = process.env.EMAIL_TEMPLATES_DIR?.trim();
	const candidateDirs = [
		envDir,
		path.resolve(process.cwd(), '../../packages/emails/build_local'),
		path.resolve(process.cwd(), '../../packages/emails/build_production'),
		path.resolve(process.cwd(), 'emails')
	].filter((value): value is string => Boolean(value));

	for (const candidateDir of candidateDirs) {
		const candidatePath = path.join(candidateDir, templateName);

		try {
			await fs.access(candidatePath);
			return candidatePath;
		} catch {
			// keep searching
		}
	}

	throw new Error(`Email template not found: ${templateName}`);
}

async function getTemplateHtml(templateName: string) {
	const cached = templateCache.get(templateName);
	if (cached) {
		return cached;
	}

	const templatePath = await resolveTemplatePath(templateName);
	const template = await fs.readFile(templatePath, 'utf8');
	templateCache.set(templateName, template);
	return template;
}

async function resolveEmailBranding(actionUrl: string): Promise<AuthEmailBranding> {
	const branding = await getBrandingSettings();
	const brandingName = branding.appName?.trim() || 'Kite';
	const configuredLogoUrl = branding.logoUrl?.trim();

	let logoSrc;

	try {
		logoSrc = new URL(configuredLogoUrl || '/images/logo.png', actionUrl).toString();
	} catch {
		logoSrc = '';
	}

	return {
		name: brandingName,
		logoSrc
	};
}

function toResetPasswordSubject(brandingName: string) {
	return `Reset your ${brandingName} password`;
}

function toVerifyEmailSubject(brandingName: string) {
	return `Verify your ${brandingName} email`;
}

function toResetPasswordTextBody(
	recipient: AuthEmailRecipient,
	branding: AuthEmailBranding,
	resetUrl: string
) {
	const recipientName = recipient.name?.trim();
	const lines = [
		recipientName ? `Hi ${recipientName},` : 'Hello,',
		'',
		`A password reset was requested for your ${branding.name} account.`,
		'',
		`Reset password: ${resetUrl}`,
		'',
		'If you did not request this, you can safely ignore this email.',
		'',
		`© ${new Date().getFullYear()} ${branding.name}`
	];

	return lines.join('\n');
}

function toVerifyEmailTextBody(
	recipient: AuthEmailRecipient,
	branding: AuthEmailBranding,
	verifyUrl: string
) {
	const recipientName = recipient.name?.trim();
	const lines = [
		recipientName ? `Hi ${recipientName},` : 'Hello,',
		'',
		`Please verify your email address for your ${branding.name} account.`,
		'',
		`Verify email: ${verifyUrl}`,
		'',
		'If you did not create this account, you can safely ignore this email.',
		'',
		`© ${new Date().getFullYear()} ${branding.name}`
	];

	return lines.join('\n');
}

async function toHtmlBody(
	templateName: string,
	recipient: AuthEmailRecipient,
	branding: AuthEmailBranding,
	actionUrl: string
) {
	const template = await getTemplateHtml(templateName);

	return renderTemplateVariables(template, {
		brandingName: branding.name,
		recipientName: recipient.name?.trim() || 'there',
		actionUrl,
		year: String(new Date().getFullYear()),
		logoSrc: branding.logoSrc
	});
}

export function isAuthEmailConfigured() {
	return isEmailConfigured();
}

export async function sendPasswordResetEmail(recipient: AuthEmailRecipient, resetUrl: string) {
	const email = recipient.email.trim().toLowerCase();
	const branding = await resolveEmailBranding(resetUrl);

	const html = await toHtmlBody('reset-password.html', recipient, branding, resetUrl);

	await sendEmail({
		to: {
			email,
			name: recipient.name?.trim() || undefined
		},
		subject: toResetPasswordSubject(branding.name),
		text: toResetPasswordTextBody(recipient, branding, resetUrl),
		html
	});
}

export async function sendVerificationEmail(recipient: AuthEmailRecipient, verifyUrl: string) {
	const email = recipient.email.trim().toLowerCase();
	const branding = await resolveEmailBranding(verifyUrl);

	const html = await toHtmlBody('verify-email.html', recipient, branding, verifyUrl);

	await sendEmail({
		to: {
			email,
			name: recipient.name?.trim() || undefined
		},
		subject: toVerifyEmailSubject(branding.name),
		text: toVerifyEmailTextBody(recipient, branding, verifyUrl),
		html
	});
}

export function resetAuthMailerForTests() {
	templateCache.clear();
	resetEmailTransportForTests();
}
