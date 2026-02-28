import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { requireAdminUser } from '$lib/server/http-auth';
import { getAlertSettings, saveAlertSettings } from '$lib/server/services/settings';

type AlertType = 'info' | 'success' | 'warning' | 'error';

type AlertBannerInput = {
	enabled?: unknown;
	message?: unknown;
	type?: unknown;
};

function isAlertType(value: unknown): value is AlertType {
	return value === 'info' || value === 'success' || value === 'warning' || value === 'error';
}

function parseBanner(value: unknown, label: string) {
	const banner = (value ?? {}) as AlertBannerInput;

	if (typeof banner.enabled !== 'boolean') {
		return {
			error: json(
				{ error: { code: 'INVALID_INPUT', message: `${label}.enabled is required` } },
				{ status: 400 }
			)
		};
	}

	if (typeof banner.message !== 'string') {
		return {
			error: json(
				{ error: { code: 'INVALID_INPUT', message: `${label}.message is required` } },
				{ status: 400 }
			)
		};
	}

	if (!isAlertType(banner.type)) {
		return {
			error: json(
				{ error: { code: 'INVALID_INPUT', message: `${label}.type is invalid` } },
				{ status: 400 }
			)
		};
	}

	return {
		data: {
			enabled: banner.enabled,
			message: banner.message,
			type: banner.type
		}
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const data = await getAlertSettings();
		return json({ data }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'ALERT_SETTINGS_FETCH_FAILED', message: 'Failed to load alert settings' } },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const body = await request.json().catch(() => ({}));

	const parsedGlobalAnnouncement = parseBanner(body?.globalAnnouncement, 'globalAnnouncement');
	if (parsedGlobalAnnouncement.error) {
		return parsedGlobalAnnouncement.error;
	}

	const parsedShareFlowAlert = parseBanner(body?.shareFlowAlert, 'shareFlowAlert');
	if (parsedShareFlowAlert.error) {
		return parsedShareFlowAlert.error;
	}

	try {
		const data = await saveAlertSettings({
			globalAnnouncement: parsedGlobalAnnouncement.data,
			shareFlowAlert: parsedShareFlowAlert.data
		});
		return json({ data }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'ALERT_SETTINGS_SAVE_FAILED', message: 'Failed to save alert settings' } },
			{ status: 500 }
		);
	}
};
