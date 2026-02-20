import { relations as authRelations } from './auth';
import { otherRelations } from './relations';

export * from './auth';
export * from './upload';
export * from './share';
export * from './share-upload';
export * from './token-store';
export * from './audit-log';
export * from './settings';

export const relations = {
	...authRelations,
	...otherRelations
};
