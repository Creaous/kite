import packageJson from '../../../../package.json';

const DEFAULT_REPOSITORY_URL = 'https://git.codeguilds.org/Mitchell/kite';
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

type ReleaseResponse = {
	id: number;
	tag_name: string;
	name?: string;
	html_url?: string;
	url?: string;
	published_at?: string;
	draft?: boolean;
	prerelease?: boolean;
};

type ParsedVersion = {
	parts: number[];
	pre: string[];
};

export type UpdateStatus = {
	repositoryUrl: string;
	currentVersion: string;
	latestVersion: string | null;
	latestReleaseUrl: string | null;
	hasUpdate: boolean;
	checkedAt: string;
	error: string | null;
};

let cachedStatus: { value: UpdateStatus; expiresAt: number } | null = null;

function normalizeVersion(input: string) {
	return input.trim().replace(/^v/i, '');
}

function parseVersion(input: string): ParsedVersion | null {
	const normalized = normalizeVersion(input);
	if (!normalized) return null;

	const [core, pre = ''] = normalized.split('-', 2);
	const parts = core.split('.').map((value) => Number.parseInt(value, 10));

	if (parts.some((value) => Number.isNaN(value))) {
		return null;
	}

	const preParts = pre
		.split('.')
		.map((value) => value.trim())
		.filter(Boolean);

	return {
		parts,
		pre: preParts
	};
}

function compareIdentifiers(a: string, b: string) {
	const aNumber = Number.parseInt(a, 10);
	const bNumber = Number.parseInt(b, 10);
	const aIsNumber = String(aNumber) === a;
	const bIsNumber = String(bNumber) === b;

	if (aIsNumber && bIsNumber) {
		if (aNumber === bNumber) return 0;
		return aNumber > bNumber ? 1 : -1;
	}

	if (aIsNumber) return -1;
	if (bIsNumber) return 1;

	if (a === b) return 0;
	return a > b ? 1 : -1;
}

function compareVersion(left: string, right: string) {
	const leftParsed = parseVersion(left);
	const rightParsed = parseVersion(right);

	if (!leftParsed || !rightParsed) {
		return 0;
	}

	const maxParts = Math.max(leftParsed.parts.length, rightParsed.parts.length);
	for (let index = 0; index < maxParts; index += 1) {
		const leftPart = leftParsed.parts[index] ?? 0;
		const rightPart = rightParsed.parts[index] ?? 0;
		if (leftPart === rightPart) continue;
		return leftPart > rightPart ? 1 : -1;
	}

	const leftHasPre = leftParsed.pre.length > 0;
	const rightHasPre = rightParsed.pre.length > 0;
	if (!leftHasPre && !rightHasPre) return 0;
	if (!leftHasPre) return 1;
	if (!rightHasPre) return -1;

	const maxPre = Math.max(leftParsed.pre.length, rightParsed.pre.length);
	for (let index = 0; index < maxPre; index += 1) {
		const leftPart = leftParsed.pre[index];
		const rightPart = rightParsed.pre[index];
		if (leftPart === undefined) return -1;
		if (rightPart === undefined) return 1;
		const result = compareIdentifiers(leftPart, rightPart);
		if (result !== 0) return result;
	}

	return 0;
}

function toApiEndpoint(repositoryUrl: string) {
	const parsed = new URL(repositoryUrl);
	const [owner, repo] = parsed.pathname.split('/').filter(Boolean);

	if (!owner || !repo) {
		throw new Error('Invalid repository URL. Expected /owner/repo path.');
	}

	const encodedOwner = encodeURIComponent(owner);
	const encodedRepo = encodeURIComponent(repo);

	return `${parsed.origin}/api/v1/repos/${encodedOwner}/${encodedRepo}/releases/latest`;
}

function getCurrentVersion() {
	if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
		return packageJson.version.trim();
	}

	return '0.0.0';
}

async function fetchLatestRelease(repositoryUrl: string): Promise<ReleaseResponse> {
	const endpoint = toApiEndpoint(repositoryUrl);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	try {
		const response = await fetch(endpoint, {
			headers: { accept: 'application/json' },
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`Release check failed with status ${response.status}`);
		}

		return (await response.json()) as ReleaseResponse;
	} finally {
		clearTimeout(timeout);
	}
}

export async function getUpdateStatus(force = false): Promise<UpdateStatus> {
	const repositoryUrl = process.env.UPDATE_REPOSITORY_URL?.trim() || DEFAULT_REPOSITORY_URL;
	const currentVersion = getCurrentVersion();
	const now = Date.now();

	if (!force && cachedStatus && cachedStatus.expiresAt > now) {
		return cachedStatus.value;
	}

	const baseStatus: UpdateStatus = {
		repositoryUrl,
		currentVersion,
		latestVersion: null,
		latestReleaseUrl: null,
		hasUpdate: false,
		checkedAt: new Date(now).toISOString(),
		error: null
	};

	try {
		const latestRelease = await fetchLatestRelease(repositoryUrl);
		const latestVersion =
			typeof latestRelease.tag_name === 'string' && latestRelease.tag_name.trim()
				? latestRelease.tag_name.trim()
				: null;

		const status: UpdateStatus = {
			...baseStatus,
			latestVersion,
			latestReleaseUrl: latestRelease.html_url ?? null,
			hasUpdate: latestVersion
				? compareVersion(normalizeVersion(latestVersion), currentVersion) > 0
				: false
		};

		cachedStatus = {
			value: status,
			expiresAt: now + CACHE_TTL_MS
		};

		return status;
	} catch (error) {
		const status: UpdateStatus = {
			...baseStatus,
			error: error instanceof Error ? error.message : 'Unknown update check error'
		};

		cachedStatus = {
			value: status,
			expiresAt: now + CACHE_TTL_MS
		};

		return status;
	}
}
