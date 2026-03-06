import { relations as authRelations } from './auth';
import { relations as userProfileRelations } from './user-profile';
import { otherRelations } from './relations';

export * from './auth';
export * from './upload';
export * from './share';
export * from './share-upload';
export * from './token-store';
export * from './audit-log';
export * from './settings';
export * from './user-profile';

export const relations = {
	...authRelations,
	...userProfileRelations,
	...otherRelations
};
