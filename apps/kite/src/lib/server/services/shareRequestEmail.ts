import fs from 'node:fs/promises';
import path from 'node:path';

import { isEmailConfigured, resetEmailTransportForTests, sendEmail } from './email';
import { getBrandingSettings } from './settings';

type ShareRequestRecipient = {
	name?: string | null;
	email: string;
};

type ShareRequestEmailPayload = {
	recipients: ShareRequestRecipient[];
	requestUrl: string;
	shareRequest: {
		code: string;
		title: string | null;
		message: string | null;
		requesterName: string | null;
		requesterEmail: string | null;
	};
};

type ShareRequestEmailResult = {
	accepted: string[];
	rejected: string[];
};

type EmailBranding = {
	name: string;
	logoSrc: string;
};

let shareRequestTemplateHtml: string | null = null;

function toSubject(title: string | null, code: string) {
	if (title && title.trim()) {
		return `File request: ${title.trim()}`;
	}
	return `File request: ${code}`;
}

function toTextBody(
	payload: ShareRequestEmailPayload,
	branding: EmailBranding,
	recipient?: ShareRequestRecipient
) {
	const recipientName = recipient?.name?.trim();
	const title = payload.shareRequest.title ?? payload.shareRequest.code;
	const lines = [
		recipientName ? `Hi ${recipientName},` : 'Hello,',
		'',
		"You've received a file request. Use the link below to view and respond.",
		'',
		'File request details:',
		`- Request: ${title}`,
		`- Code: ${payload.shareRequest.code}`
	];

	if (payload.shareRequest.message?.trim()) {
		lines.push('- Message:', `  ${payload.shareRequest.message.trim()}`);
	}

	if (payload.shareRequest.requesterName?.trim() || payload.shareRequest.requesterEmail?.trim()) {
		lines.push(
			`- Requested by: ${payload.shareRequest.requesterName?.trim() ?? 'Unknown'}${payload.shareRequest.requesterEmail?.trim() ? ` <${payload.shareRequest.requesterEmail.trim()}>` : ''}`
		);
	}

	lines.push(
		'',
		`View request: ${payload.requestUrl}`,
		'',
		"If you weren't expecting this, you can safely ignore this email.",
		'',
		`© ${new Date().getFullYear()} ${branding.name}`
	);

	return lines.join('\n');
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function isTruthy(value: string | null | undefined) {
	return Boolean(value && value.trim());
}

function renderTemplateConditionals(
	template: string,
	values: Record<string, string | null | undefined>
): string {
	const openTagPrefix = '{{#if ';
	const closeTag = '{{/if}}';

	function parse(index: number): [string, number] {
		let output = '';

		while (index < template.length) {
			if (template.startsWith(closeTag, index)) {
				return [output, index + closeTag.length];
			}

			if (template.startsWith(openTagPrefix, index)) {
				const keyStart = index + openTagPrefix.length;
				const keyEnd = template.indexOf('}}', keyStart);

				if (keyEnd === -1) {
					output += template.slice(index);
					return [output, template.length];
				}

				const key = template.slice(keyStart, keyEnd).trim();
				const [inner, nextIndex] = parse(keyEnd + 2);

				if (isTruthy(values[key])) {
					output += inner;
				}

				index = nextIndex;
				continue;
			}

			output += template[index];
			index += 1;
		}

		return [output, index];
	}

	return parse(0)[0];
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

async function resolveShareRequestTemplatePath() {
	const envDir = process.env.EMAIL_TEMPLATES_DIR?.trim();
	const candidateDirs = [
		envDir,
		path.resolve(process.cwd(), '../../packages/emails/build_local'),
		path.resolve(process.cwd(), '../../packages/emails/build_production'),
		path.resolve(process.cwd(), 'emails')
	].filter((value): value is string => Boolean(value));

	for (const candidateDir of candidateDirs) {
		const candidatePath = path.join(candidateDir, 'share-request.html');

		try {
			await fs.access(candidatePath);
			return candidatePath;
		} catch {
			// keep searching
		}
	}

	throw new Error('Share request email template not found');
}

async function getShareRequestTemplateHtml() {
	if (shareRequestTemplateHtml) {
		return shareRequestTemplateHtml;
	}

	const templatePath = await resolveShareRequestTemplatePath();
	shareRequestTemplateHtml = await fs.readFile(templatePath, 'utf8');
	return shareRequestTemplateHtml;
}

async function resolveEmailBranding(requestUrl: string): Promise<EmailBranding> {
	const branding = await getBrandingSettings();
	const brandingName = branding.appName?.trim() || 'Kite';
	const configuredLogoUrl = branding.logoUrl?.trim();

	let logoSrc;

	try {
		logoSrc = new URL(configuredLogoUrl || '/images/logo.png', requestUrl).toString();
	} catch {
		logoSrc = '';
	}

	return {
		name: brandingName,
		logoSrc
	};
}

async function toHtmlBody(
	payload: ShareRequestEmailPayload,
	branding: EmailBranding,
	recipient?: ShareRequestRecipient
) {
	const title = payload.shareRequest.title ?? payload.shareRequest.code;
	const message = payload.shareRequest.message?.trim() || null;
	const requesterName = payload.shareRequest.requesterName?.trim() || null;
	const requesterEmail = payload.shareRequest.requesterEmail?.trim() || null;
	const recipientName = recipient?.name?.trim() || 'there';
	const year = String(new Date().getFullYear());

	const template = await getShareRequestTemplateHtml();
	const withConditionals = renderTemplateConditionals(template, {
		message,
		requesterName,
		requesterEmail
	});

	return renderTemplateVariables(withConditionals, {
		brandingName: branding.name,
		recipientName,
		title,
		code: payload.shareRequest.code,
		message,
		requestUrl: payload.requestUrl,
		requesterName,
		requesterEmail,
		year,
		logoSrc: branding.logoSrc
	});
}

export function isShareRequestEmailConfigured() {
	return isEmailConfigured();
}

export async function sendShareRequestEmail(
	payload: ShareRequestEmailPayload
): Promise<ShareRequestEmailResult> {
	if (!Array.isArray(payload.recipients) || payload.recipients.length === 0) {
		throw new Error('At least one recipient is required');
	}

	const accepted: string[] = [];
	const rejected: string[] = [];
	const branding = await resolveEmailBranding(payload.requestUrl);

	for (const recipient of payload.recipients) {
		const email = recipient.email.trim().toLowerCase();

		try {
			const html = await toHtmlBody(payload, branding, recipient);

			const result = await sendEmail({
				to: {
					email,
					name: recipient.name?.trim() || undefined
				},
				subject: toSubject(payload.shareRequest.title, payload.shareRequest.code),
				text: toTextBody(payload, branding, recipient),
				html
			});

			if (Array.isArray(result.rejected) && result.rejected.length > 0) {
				rejected.push(email);
			} else {
				accepted.push(email);
			}
		} catch {
			rejected.push(email);
		}
	}

	return {
		accepted,
		rejected
	};
}

export function resetShareRequestMailerForTests() {
	shareRequestTemplateHtml = null;
	resetEmailTransportForTests();
}
