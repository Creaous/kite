import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../db';
import { uploads, user } from '../db/schema';
import { eq } from 'drizzle-orm';
import { initiateUpload, appendChunk, finalizeUpload } from './upload';

describe('upload service (db)', () => {
	const createdIds: string[] = [];
	const createdUserIds: string[] = [];

	afterEach(async () => {
		// cleanup created uploads
		for (const id of createdIds.splice(0)) {
			await db.delete(uploads).where(eq(uploads.id, id)).returning();
		}
		for (const id of createdUserIds.splice(0)) {
			await db.delete(user).where(eq(user.id, id)).returning();
		}
	});

	it('returns existing upload when fingerprint found', async () => {
		// create user for uploadedBy foreign key
		const [u] = await db
			.insert(user)
			.values({ id: 'user1', name: 'user1', email: 'user1@example.com', emailVerified: false })
			.returning();
		createdUserIds.push(u.id);

		const [created] = await db
			.insert(uploads)
			.values({
				fingerprint: 'fp',
				filename: 'a.txt',
				size: 100,
				chunkSize: 1024,
				uploadedBytes: 100,
				status: 'ready',
				uploadedBy: 'user1'
			})
			.returning();

		createdIds.push(created.id);

		const res = await initiateUpload({
			filename: 'a.txt',
			size: 100,
			fingerprint: 'fp',
			uploadedBy: 'user1'
		});

		expect(res.uploadId).toBe(created.id);
		expect(res.deduplicated).toBe(true);
	});

	it('creates a new ready record with newest path when fingerprint matches existing ready upload', async () => {
		const [u] = await db
			.insert(user)
			.values({ id: 'user3', name: 'user3', email: 'user3@example.com', emailVerified: false })
			.returning();
		createdUserIds.push(u.id);

		const [original] = await db
			.insert(uploads)
			.values({
				fingerprint: 'fp-path-preserve',
				filename: 'report.pdf',
				relativePath: 'folder-a/report.pdf',
				size: 300,
				chunkSize: 300,
				uploadedBytes: 300,
				status: 'ready',
				storageProvider: 'local',
				storagePath: '/tmp/upload-path-preserve.bin',
				uploadedBy: 'user3'
			})
			.returning();
		createdIds.push(original.id);

		const deduped = await initiateUpload({
			filename: 'report.pdf',
			relativePath: 'report.pdf',
			size: 300,
			fingerprint: 'fp-path-preserve',
			uploadedBy: 'user3'
		});

		expect(deduped.uploadId).toBeDefined();
		expect(deduped.uploadId).not.toBe(original.id);
		expect(deduped.status).toBe('ready');
		expect(deduped.deduplicated).toBe(true);
		createdIds.push(deduped.uploadId);

		const [newRow] = await db
			.select({ relativePath: uploads.relativePath, storagePath: uploads.storagePath })
			.from(uploads)
			.where(eq(uploads.id, deduped.uploadId));
		expect(newRow.relativePath).toBe('report.pdf');
		expect(newRow.storagePath).toBe('/tmp/upload-path-preserve.bin');

		const [oldRow] = await db
			.select({ relativePath: uploads.relativePath })
			.from(uploads)
			.where(eq(uploads.id, original.id));
		expect(oldRow.relativePath).toBe('folder-a/report.pdf');
	});

	it('creates a new upload when none exists', async () => {
		// ensure user2 exists for uploadedBy
		const [u2] = await db
			.insert(user)
			.values({ id: 'user2', name: 'user2', email: 'user2@example.com', emailVerified: false })
			.returning();
		createdUserIds.push(u2.id);

		const res = await initiateUpload({
			filename: 'b.txt',
			relativePath: 'folder-a/b.txt',
			size: 200,
			fingerprint: 'fp2',
			uploadedBy: 'user2'
		});
		expect(res.uploadId).toBeDefined();
		expect(res.deduplicated).toBe(false);
		createdIds.push(res.uploadId!);

		const [created] = await db
			.select({ relativePath: uploads.relativePath })
			.from(uploads)
			.where(eq(uploads.id, res.uploadId!));
		expect(created.relativePath).toBe('folder-a/b.txt');
	});

	it('appendChunk updates uploadedBytes', async () => {
		const [created] = await db
			.insert(uploads)
			.values({
				fingerprint: 'fp3',
				filename: 'c.txt',
				size: 1024,
				uploadedBytes: 0,
				status: 'pending'
			})
			.returning();
		createdIds.push(created.id);

		const res = await appendChunk(created.id, new ArrayBuffer(512));
		expect(res.uploadedBytes).toBe(512);
		expect(res.status).toBe('uploading');
	});

	it('finalizeUpload cancels and finalizes', async () => {
		const [toCancel] = await db
			.insert(uploads)
			.values({
				fingerprint: 'fp-cancel',
				filename: 'd.txt',
				size: 10,
				uploadedBytes: 0,
				status: 'pending'
			})
			.returning();
		createdIds.push(toCancel.id);

		const resCancel = await finalizeUpload(toCancel.id, 'cancel');
		expect(resCancel.status).toBe('cancelled');

		const [toFinalize] = await db
			.insert(uploads)
			.values({
				fingerprint: 'fp-finalize',
				filename: 'e.txt',
				size: 20,
				uploadedBytes: 0,
				status: 'pending'
			})
			.returning();
		createdIds.push(toFinalize.id);

		const resFinalize = await finalizeUpload(toFinalize.id, 'finalize');
		expect(resFinalize.status).toBe('ready');
	});
});
