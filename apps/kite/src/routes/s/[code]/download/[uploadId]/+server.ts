import type { RequestHandler } from './$types';

async function streamUpload(event: Parameters<RequestHandler>[0], password?: string) {
	const normalizedPassword = typeof password === 'string' && password.trim() ? password : undefined;

	const response = await event.fetch(
		`/api/v1/public/shares/${event.params.code}/download/${event.params.uploadId}`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ password: normalizedPassword })
		}
	);

	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		return new Response(body?.error?.message ?? 'Unable to download file.', {
			status: response.status
		});
	}

	const headers = new Headers(response.headers);
	if (!headers.has('content-disposition')) {
		headers.set('content-disposition', `attachment; filename="${event.params.uploadId}.bin"`);
	}

	return new Response(response.body, {
		status: 200,
		headers
	});
}

export const GET: RequestHandler = async (event) => {
	return streamUpload(event);
};

export const POST: RequestHandler = async (event) => {
	const body = await event.request.json().catch(() => ({}));
	return streamUpload(event, body?.password);
};
