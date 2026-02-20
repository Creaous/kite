import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

export type Permission = {
	[K in keyof typeof ac.statements]?: (typeof ac.statements)[K][number][];
};

/**
 * Access control statements defining available permissions
 * Make sure to use `as const` so TypeScript can infer types correctly
 */
export const statement = {
	...defaultStatements,
	shareRequest: ['create']
} as const;

/**
 * Access control instance with defined statements
 */
export const ac = createAccessControl(statement);

/**
 * Admin role with full permissions
 */
export const admin = ac.newRole({
	shareRequest: ['create'],
	...adminAc.statements
});

/**
 * Standard user role with basic permissions
 */
export const user = ac.newRole({
	...userAc.statements
});

/**
 * Trusted user role with extended permissions
 */
export const trusted = ac.newRole({
	shareRequest: ['create'],
	...userAc.statements
});
