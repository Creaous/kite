import { auth } from '$lib/server/auth';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type NextPath =
	| '/'
	| '/admin'
	| '/share-requests'
	| '/shares'
	| '/sign-in'
	| '/sign-up'
	| `/r/${string}`
	| `/s/${string}`;

function getSafeNext(value: unknown): NextPath {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';

	if (value.startsWith('/r/') || value.startsWith('/s/')) {
		return value as NextPath;
	}

	switch (value) {
		case '/':
		case '/admin':
		case '/share-requests':
		case '/shares':
		case '/sign-in':
		case '/sign-up':
			return value;
		default:
			return '/';
	}
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		next: getSafeNext(url.searchParams.get('next'))
	};
};

export const actions = {
	email: async (event) => {
		const data = await event.request.formData();
		const email = data.get('email');
		const password = data.get('password');
		const next = getSafeNext(data.get('next'));

		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, { errorMessage: 'Email and password are required.' });
		}

		try {
			await auth.api.signInEmail({
				headers: event.request.headers,
				body: {
					email,
					password,
					rememberMe: true
				}
			});
		} catch {
			return fail(400, { errorMessage: 'Unable to sign in.' });
		}

		throw redirect(303, next);
	},
	social: async (event) => {
		const data = await event.request.formData();
		const provider = data.get('provider');
		const next = getSafeNext(data.get('next'));
		const requestSignUp = data.get('requestSignUp') === 'true';

		if (typeof provider !== 'string') {
			return fail(400, { errorMessage: 'Social provider is required.' });
		}

		try {
			const response = await auth.api.signInSocial({
				headers: event.request.headers,
				body: {
					provider,
					callbackURL: next,
					requestSignUp
				},
				asResponse: true
			});

			const location = response.headers.get('location');
			if (!location) {
				return fail(500, { errorMessage: 'Unable to start social sign in.' });
			}

			throw redirect(303, location);
		} catch {
			return fail(400, { errorMessage: 'Unable to start social sign in.' });
		}
	}
} satisfies Actions;
