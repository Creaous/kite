import type { User, Session } from 'better-auth';

type AppUser = User & {
	role?: string | null;
	isAnonymous?: boolean | null;
};

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AppUser;
			session?: Session;
		}

		interface Error {
			code?: string;
		}
	}
}

export {};
