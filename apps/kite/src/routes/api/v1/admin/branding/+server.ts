import { requireAdminUser } from '$lib/server/http-auth';
import { getBrandingSettings, saveBrandingSettings } from '$lib/server/services/settings';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	try {
		const data = await getBrandingSettings();
		return json({ data }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'BRANDING_FETCH_FAILED', message: 'Failed to load branding settings' } },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
	const unauthorized = requireAdminUser(locals);
	if (unauthorized) return unauthorized;

	const body = await request.json().catch(() => ({}));

	if (typeof body?.appName !== 'string' || body.appName.trim().length === 0) {
		return json(
			{ error: { code: 'INVALID_INPUT', message: 'appName is required' } },
			{ status: 400 }
		);
	}

	try {
		const data = await saveBrandingSettings({
			appName: body.appName,
			tagline: typeof body?.tagline === 'string' ? body.tagline : '',
			logoUrl: typeof body?.logoUrl === 'string' ? body.logoUrl : '',
			faviconUrl: typeof body?.faviconUrl === 'string' ? body.faviconUrl : '',
			disableIndexing: typeof body?.disableIndexing === 'boolean' ? body.disableIndexing : false
		});

		return json({ data }, { status: 200 });
	} catch {
		return json(
			{ error: { code: 'BRANDING_SAVE_FAILED', message: 'Failed to save branding settings' } },
			{ status: 500 }
		);
	}
};
