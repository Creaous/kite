import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, userAc } from 'better-auth/plugins/admin/access';

export type Permission = {
	[K in keyof typeof ac.statements]?: (typeof ac.statements)[K][number][];
};

export const statement = {
	...defaultStatements,
	shareRequest: ['create']
} as const;

export const ac = createAccessControl(statement);

export const admin = ac.newRole({
	shareRequest: ['create'],
	...adminAc.statements
});

export const user = ac.newRole({
	...userAc.statements
});

export const trusted = ac.newRole({
	shareRequest: ['create'],
	...userAc.statements
});
