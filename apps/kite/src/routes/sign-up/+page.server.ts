import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Actions } from './$types';
import { auth } from '$lib/server/auth';
import { fail } from '@sveltejs/kit';

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

export const load: PageServerLoad = async ({ parent, url }) => {
	const { authSettings } = await parent();

	if (!authSettings.registrationEnabled) {
		throw redirect(303, '/sign-in?registrationDisabled=1');
	}

	return {
		next: getSafeNext(url.searchParams.get('next'))
	};
};

export const actions = {
	default: async (event) => {
		const data = await event.request.formData();
		const name = data.get('name');
		const email = data.get('email');
		const password = data.get('password');
		const next = getSafeNext(data.get('next'));

		if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, { errorMessage: 'Name, email and password are required.' });
		}

		try {
			await auth.api.signUpEmail({
				headers: event.request.headers,
				body: {
					name,
					email,
					password
				}
			});
		} catch {
			return fail(400, { errorMessage: 'Unable to create account.' });
		}

		throw redirect(303, next);
	}
} satisfies Actions;
