import { defineRelationsPart } from 'drizzle-orm';

import { user } from './auth';
import { shares, shareRequests } from './share';
import { shareUpload } from './share-upload';
import { tokenStore } from './token-store';
import { uploads } from './upload';
import { auditLog } from './audit-log';

export const otherRelations = defineRelationsPart(
	{ shares, uploads, user, shareRequests, shareUpload, tokenStore, auditLog },
	(r) => ({
		shares: {
			uploader: r.one.user({
				from: [r.shares.createdBy],
				to: [r.user.id]
			}),
			request: r.one.shareRequests({
				from: [r.shares.sourceRequestId],
				to: [r.shareRequests.id]
			}),
			files: r.many.uploads({
				from: r.shares.id.through(r.shareUpload.shareId),
				to: r.uploads.id.through(r.shareUpload.uploadId)
			})
		},
		uploads: {
			shares: r.many.shares(),
			uploader: r.one.user({
				from: [r.uploads.uploadedBy],
				to: [r.user.id]
			})
		},
		shareRequests: {
			requester: r.one.user({
				from: [r.shareRequests.createdBy],
				to: [r.user.id]
			}),
			submissions: r.many.shares()
		},
		auditLog: {
			actor: r.one.user({
				from: [r.auditLog.actorId],
				to: [r.user.id]
			})
		}
	})
);
