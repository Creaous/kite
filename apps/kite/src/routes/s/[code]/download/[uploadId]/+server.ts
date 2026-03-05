import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const password = event.url.searchParams.get('password') || undefined;

	const grantResponse = await event.fetch(`/api/v1/public/shares/${event.params.code}/download`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ password })
	});

	const grantBody = await grantResponse.json().catch(() => ({}));
	if (!grantResponse.ok) {
		return new Response(grantBody?.error?.message ?? 'Unable to prepare download.', {
			status: grantResponse.status
		});
	}

	const matches = (grantBody.data?.downloadUrls ?? []) as { uploadId: string; url: string }[];
	const target = matches.find((item) => item.uploadId === event.params.uploadId)?.url;
	if (!target) {
		return new Response('File is not available for download.', { status: 404 });
	}

	throw redirect(303, target);
};
