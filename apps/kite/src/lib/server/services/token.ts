import { error } from '@sveltejs/kit';
import { db } from '../db';
import * as jose from 'jose';
import { tokenStore } from '../db/schema';
import { deflateSync, inflateSync } from 'zlib';
import { and, eq, gt } from 'drizzle-orm';
import { createHash } from 'node:crypto';

const tokenSecretValue = process.env.TOKEN_SECRET;

if (process.env.NODE_ENV === 'production' && !tokenSecretValue) {
	throw new Error('TOKEN_SECRET must be configured in production');
}

export const tokenSecret = new TextEncoder().encode(String(tokenSecretValue ?? 'dev-secret'));

export type DownloadToken = jose.JWTPayload & {
	shareId?: string;
	shareUploadId?: string;
};

export type AnonymousToken = jose.JWTPayload & {
	userAgent?: string;
	ipAddress?: string;
};

/**
 * Generate a JWT token and persist a short-lived token record in `token_store`.
 * The DB record contains `token`, `subject`, `purpose`, `expiresAt`, and `used`.
 */
export async function generateToken(
	payload: Record<string, unknown>,
	subject?: string,
	options?: { expiration?: string; purpose?: string }
) {
	const exp = options?.expiration ?? '15m';

	const jwt = await new jose.SignJWT(payload)
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(exp)
		.setSubject(subject ?? String(payload['sub'] ?? ''))
		.sign(tokenSecret);

	// Verify locally to obtain the numeric `exp` claim
	const verified = await jose.jwtVerify(jwt, tokenSecret).catch(() => null);
	let expiresAt: Date;
	if (verified && verified.payload && typeof verified.payload.exp === 'number') {
		expiresAt = new Date(verified.payload.exp * 1000);
	} else {
		// fallback: short ttl
		expiresAt = new Date(Date.now() + 15 * 60 * 1000);
	}

	const record = {
		token: jwt,
		subject: subject ?? (payload['sub'] ? String(payload['sub']) : null),
		purpose: options?.purpose ?? String(payload['purpose'] ?? 'generic'),
		expiresAt,
		used: false
	} as const;

	const result = await db.insert(tokenStore).values(record).returning();
	return { jwt, dbRecord: result };
}

export async function generateDownloadToken(
	payload: { shareId?: string; shareUploadId?: string },
	userId?: string
) {
	return generateToken(payload as DownloadToken, userId, {
		purpose: 'download',
		expiration: '15m'
	});
}

export async function generateAnonymousToken(payload: { userAgent?: string; ipAddress?: string }) {
	return generateToken(payload as AnonymousToken, undefined, {
		purpose: 'anonymous',
		expiration: '5m'
	});
}

const MAX_ACTIVE_ANONYMOUS_TOKENS_PER_SUBJECT = 3;

export function createAnonymousSubject(scope: {
	shareRequestCode: string;
	userAgent?: string;
	ipAddress?: string;
}) {
	const fingerprint = `${scope.shareRequestCode}:${scope.userAgent ?? ''}:${scope.ipAddress ?? ''}`;
	const digest = createHash('sha256').update(fingerprint).digest('hex');
	return `share-request:${scope.shareRequestCode}:${digest.slice(0, 24)}`;
}

export async function generateLimitedAnonymousToken(scope: {
	shareRequestCode: string;
	userAgent?: string;
	ipAddress?: string;
}) {
	const subject = createAnonymousSubject(scope);

	const activeTokens = await db
		.select({ token: tokenStore.token })
		.from(tokenStore)
		.where(
			and(
				eq(tokenStore.subject, subject),
				eq(tokenStore.purpose, 'anonymous'),
				eq(tokenStore.used, false),
				gt(tokenStore.expiresAt, new Date())
			)
		)
		.limit(MAX_ACTIVE_ANONYMOUS_TOKENS_PER_SUBJECT + 1);

	if (activeTokens.length >= MAX_ACTIVE_ANONYMOUS_TOKENS_PER_SUBJECT) {
		throw error(429, {
			message: 'Too many pending anonymous tokens. Please retry shortly.',
			code: 'ANONYMOUS_TOKEN_LIMIT_REACHED'
		});
	}

	return generateToken(
		{
			sub: subject,
			purpose: 'anonymous',
			shareRequestCode: scope.shareRequestCode,
			userAgent: scope.userAgent,
			ipAddress: scope.ipAddress
		},
		subject,
		{ purpose: 'anonymous', expiration: '5m' }
	);
}

export async function consumeToken(token: string) {
	const [updated] = await db
		.update(tokenStore)
		.set({ used: true })
		.where(eq(tokenStore.token, token))
		.returning({ token: tokenStore.token });

	if (!updated) {
		throw error(401, { message: 'Token not found', code: 'NOT_FOUND' });
	}
}

export function encodeToken(token: string) {
	const compressed = deflateSync(Buffer.from(token, 'utf-8'));
	return compressed.toString('base64url');
}

export function decodeToken(token: string) {
	const buf = Buffer.from(token, 'base64url');
	const decompressed = inflateSync(buf);
	return decompressed.toString('utf-8');
}

/**
 * Verify a JWT token and check its status in the database
 */
export async function verifyToken(token: string) {
	let payload: DownloadToken;

	try {
		const temp = await jose.jwtVerify(token, tokenSecret);
		payload = temp.payload as DownloadToken;
	} catch {
		throw error(401, { message: 'Token is invalid', code: 'INVALID_TOKEN' });
	}

	const [_token] = await db.select().from(tokenStore).where(eq(tokenStore.token, token)).limit(1);

	if (!_token) {
		throw error(401, { message: 'Token not found', code: 'NOT_FOUND' });
	}

	if (_token.used) {
		throw error(401, { message: 'Token is revoked', code: 'REVOKED_TOKEN' });
	}

	// check expiry
	if (_token.expiresAt && new Date(_token.expiresAt) < new Date()) {
		throw error(401, { message: 'Token expired', code: 'EXPIRED_TOKEN' });
	}

	return { payload, token: _token };
}
