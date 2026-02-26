import { isEmailConfigured, resetEmailTransportForTests, sendEmail } from './email';

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

function toSubject(title: string | null, code: string) {
	if (title && title.trim()) {
		return `File request: ${title.trim()}`;
	}
	return `File request: ${code}`;
}

function toTextBody(payload: ShareRequestEmailPayload, recipient?: ShareRequestRecipient) {
	const recipientName = recipient?.name?.trim();
	const lines = [
		recipientName ? `Hi ${recipientName},` : 'Hello,',
		'',
		"You've received a file request.",
		'',
		`Request: ${payload.shareRequest.title ?? payload.shareRequest.code}`,
		`Link: ${payload.requestUrl}`
	];

	if (payload.shareRequest.message?.trim()) {
		lines.push('', 'Message:', payload.shareRequest.message.trim());
	}

	if (payload.shareRequest.requesterName?.trim() || payload.shareRequest.requesterEmail?.trim()) {
		lines.push(
			'',
			`Requested by: ${payload.shareRequest.requesterName?.trim() ?? 'Unknown'}${payload.shareRequest.requesterEmail?.trim() ? ` <${payload.shareRequest.requesterEmail.trim()}>` : ''}`
		);
	}

	return lines.join('\n');
}

function toHtmlBody(payload: ShareRequestEmailPayload, recipient?: ShareRequestRecipient) {
	const title = payload.shareRequest.title ?? payload.shareRequest.code;
	const message = payload.shareRequest.message?.trim();
	const requesterName = payload.shareRequest.requesterName?.trim();
	const requesterEmail = payload.shareRequest.requesterEmail?.trim();
	const recipientName = recipient?.name?.trim();

	const requester =
		requesterName || requesterEmail
			? `<p><strong>Requested by:</strong> ${requesterName ?? 'Unknown'}${requesterEmail ? ` &lt;${requesterEmail}&gt;` : ''}</p>`
			: '';

	return [
		recipientName ? `<p>Hi ${recipientName},</p>` : '<p>Hello,</p>',
		"<p>You've received a file request.</p>",
		`<p><strong>Request:</strong> ${title}</p>`,
		`<p><a href="${payload.requestUrl}">${payload.requestUrl}</a></p>`,
		message ? `<p><strong>Message:</strong><br/>${message}</p>` : '',
		requester
	].join('');
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

	for (const recipient of payload.recipients) {
		const email = recipient.email.trim().toLowerCase();

		try {
			const result = await sendEmail({
				to: {
					email,
					name: recipient.name?.trim() || undefined
				},
				subject: toSubject(payload.shareRequest.title, payload.shareRequest.code),
				text: toTextBody(payload, recipient),
				html: toHtmlBody(payload, recipient)
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
	resetEmailTransportForTests();
}
