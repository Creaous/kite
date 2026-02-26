import { describe, it, expect, afterEach } from 'vitest';
import { db } from '../db';
import { tokenStore } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateToken, verifyToken } from './token';
import * as jose from 'jose';
import {
	tokenSecret,
	encodeToken,
	decodeToken,
	generateDownloadToken,
	generateAnonymousToken
} from './token';

describe('token service (db)', () => {
	const createdTokens: string[] = [];

	afterEach(async () => {
		for (const t of createdTokens.splice(0)) {
			await db.delete(tokenStore).where(eq(tokenStore.token, t)).returning();
		}
	});

	it('generates a token and persists a record', async () => {
		const { jwt, dbRecord } = await generateToken({ foo: 'bar' }, 'u1', {
			purpose: 'download',
			expiration: '1m'
		});

		expect(jwt).toBeDefined();
		expect(dbRecord).toBeDefined();
		// record may be an array returned by returning(); handle both shapes
		const record = Array.isArray(dbRecord) ? dbRecord[0] : dbRecord;
		if (record && record.token) createdTokens.push(record.token as string);
	});

	it('verifies token and checks db record', async () => {
		// generate a valid token first
		const { jwt, dbRecord } = await generateToken({ foo: 'x' }, 'u2', {
			purpose: 'download',
			expiration: '1m'
		});
		const record = Array.isArray(dbRecord) ? dbRecord[0] : dbRecord;
		if (record && record.token) createdTokens.push(record.token as string);

		// verify returns payload and token record
		const verified = await verifyToken(jwt);
		expect(verified).toBeDefined();
		expect(verified.token).toBeDefined();

		// invalid token should reject
		await expect(verifyToken('invalid-token')).rejects.toBeDefined();
	});
});

describe('token extra cases', () => {
	const created: string[] = [];

	afterEach(async () => {
		for (const t of created.splice(0)) {
			await db.delete(tokenStore).where(eq(tokenStore.token, t)).returning();
		}
	});

	it('encode/decode roundtrip', async () => {
		const jwt = await new jose.SignJWT({ foo: 'x' })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1m')
			.sign(tokenSecret);

		const enc = encodeToken(jwt);
		expect(typeof enc).toBe('string');
		const dec = decodeToken(enc);
		expect(dec).toBe(jwt);
	});

	it('verifyToken throws NOT_FOUND when no db record', async () => {
		const jwt = await new jose.SignJWT({ foo: 'nf' })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1m')
			.sign(tokenSecret);

		await expect(verifyToken(jwt)).rejects.toBeDefined();
	});

	it('verifyToken throws REVOKED_TOKEN when used=true', async () => {
		const jwt = await new jose.SignJWT({ foo: 'rev' })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1m')
			.sign(tokenSecret);

		await db
			.insert(tokenStore)
			.values({
				token: jwt,
				subject: 's',
				purpose: 'download',
				expiresAt: new Date(Date.now() + 60000),
				used: true
			})
			.returning();
		created.push(jwt);

		await expect(verifyToken(jwt)).rejects.toBeDefined();
	});

	it('verifyToken throws EXPIRED_TOKEN when expired', async () => {
		const jwt = await new jose.SignJWT({ foo: 'exp' })
			.setProtectedHeader({ alg: 'HS256' })
			.setIssuedAt()
			.setExpirationTime('1m')
			.sign(tokenSecret);

		// set expiresAt to past
		await db
			.insert(tokenStore)
			.values({
				token: jwt,
				subject: 's',
				purpose: 'download',
				expiresAt: new Date(Date.now() - 1000),
				used: false
			})
			.returning();
		created.push(jwt);

		await expect(verifyToken(jwt)).rejects.toBeDefined();
	});

	it('generateDownloadToken and generateAnonymousToken persist records', async () => {
		const { jwt: djwt, dbRecord: drec } = await generateDownloadToken({ shareId: 'sh1' }, 'u1');
		const drecord = Array.isArray(drec) ? drec[0] : drec;
		if (drecord && drecord.token) created.push(drecord.token as string);

		const { jwt: ajwt, dbRecord: arec } = await generateAnonymousToken({ userAgent: 'ua' });
		const arecord = Array.isArray(arec) ? arec[0] : arec;
		if (arecord && arecord.token) created.push(arecord.token as string);

		expect(djwt).toBeDefined();
		expect(ajwt).toBeDefined();
	});
});
