import type { User, Session } from 'better-auth';

type AppUser = User & {
	role?: string | null;
	isAnonymous?: boolean | null;
};

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
