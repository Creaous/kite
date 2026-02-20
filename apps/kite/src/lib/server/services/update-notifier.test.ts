import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpdateStatus } from './update-notifier';

describe('update notifier service', () => {
	const originalUpdateRepoUrl = process.env.UPDATE_REPOSITORY_URL;
	const validRepoUrl = 'https://git.codeguilds.org/Mitchell/kite';

	beforeEach(() => {
		process.env.UPDATE_REPOSITORY_URL = validRepoUrl;
	});

	afterEach(() => {
		process.env.UPDATE_REPOSITORY_URL = originalUpdateRepoUrl;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('reports update available when latest release tag is newer', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					tag_name: 'v9.0.0',
					html_url: 'https://git.codeguilds.org/Mitchell/kite/releases/tag/v9.0.0'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		vi.stubGlobal('fetch', fetchMock);

		const status = await getUpdateStatus(true);

		expect(status.error).toBeNull();
		expect(status.latestVersion).toBe('v9.0.0');
		expect(status.latestReleaseUrl).toContain('/releases/tag/v9.0.0');
		expect(status.hasUpdate).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports up to date when release matches current version', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					tag_name: 'v0.0.1',
					html_url: 'https://git.codeguilds.org/Mitchell/kite/releases/tag/v0.0.1'
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);

		vi.stubGlobal('fetch', fetchMock);

		const status = await getUpdateStatus(true);

		expect(status.error).toBeNull();
		expect(status.latestVersion).toBe('v0.0.1');
		expect(status.hasUpdate).toBe(false);
	});

	it('returns error status when Forgejo API fails', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }));
		vi.stubGlobal('fetch', fetchMock);

		const status = await getUpdateStatus(true);

		expect(status.hasUpdate).toBe(false);
		expect(status.latestVersion).toBeNull();
		expect(status.error).toContain('status 502');
	});

	it('returns error status when repository URL is invalid for owner/repo parsing', async () => {
		process.env.UPDATE_REPOSITORY_URL = 'https://git.codeguilds.org/Mitchell';
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		const status = await getUpdateStatus(true);

		expect(status.hasUpdate).toBe(false);
		expect(status.latestVersion).toBeNull();
		expect(status.error).toContain('Invalid repository URL');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
