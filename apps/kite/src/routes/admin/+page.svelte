<script lang="ts">
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type AdminUser = {
		id: string;
		email: string;
		name: string;
		role: string | null;
		banned?: boolean | null;
		createdAt: string;
	};

	type ListUsersResponse = {
		users: AdminUser[];
		total: number;
		limit?: number;
		offset?: number;
	};

	type MaintenanceQueueStatus = {
		job: 'expire-unused-uploads' | 'expire-expired-shares';
		counts: {
			waiting: number;
			active: number;
			delayed: number;
			completed: number;
			failed: number;
			paused: number;
		};
		isPaused: boolean;
	};

	type SocialProviderId =
		| 'apple'
		| 'discord'
		| 'facebook'
		| 'github'
		| 'gitlab'
		| 'google'
		| 'microsoft';

	type AdminAuthSettings = {
		registrationEnabled: boolean;
		anonymousTokensEnabled: boolean;
		enabledSocialProviders: SocialProviderId[];
		availableSocialProviders: SocialProviderId[];
	};

	let users = $state<AdminUser[]>([]);
	let loading = $state(true);
	let updatingUserId = $state<string | null>(null);
	let actingUserId = $state<string | null>(null);
	let queueingMaintenance = $state<string | null>(null);
	let maintenanceStatus = $state<MaintenanceQueueStatus[]>([]);
	let maintenanceStatusLoading = $state(false);
	let maintenanceStatusRefreshedAt = $state<string | null>(null);
	let savingBranding = $state(false);
	let brandingLoading = $state(true);
	let errorMessage = $state('');
	let successMessage = $state('');
	let search = $state('');
	let total = $state(0);
	let { data } = $props();

	let brandingAppName = $state(m.app_name());
	let brandingTagline = $state('');
	let brandingLogoUrl = $state('');
	let brandingFaviconUrl = $state('');
	let brandingDisableIndexing = $state(false);
	let authSettingsLoading = $state(true);
	let savingAuthSettings = $state(false);
	let registrationEnabled = $state(true);
	let anonymousTokensEnabled = $state(false);
	let enabledSocialProviders = $state<SocialProviderId[]>([]);
	let availableSocialProviders = $state<SocialProviderId[]>([]);

	function providerLabel(provider: SocialProviderId) {
		switch (provider) {
			case 'apple':
				return m.auth_provider_apple();
			case 'discord':
				return m.auth_provider_discord();
			case 'facebook':
				return m.auth_provider_facebook();
			case 'github':
				return m.auth_provider_github();
			case 'gitlab':
				return m.auth_provider_gitlab();
			case 'google':
				return m.auth_provider_google();
			case 'microsoft':
				return m.auth_provider_microsoft();
		}
	}

	function parseProviderIds(value: unknown): SocialProviderId[] {
		if (!Array.isArray(value)) return [];

		return value.filter((provider): provider is SocialProviderId => typeof provider === 'string');
	}

	async function loadUsers() {
		loading = true;
		errorMessage = '';

		const query = new SvelteURLSearchParams({ limit: '100' });
		if (search.trim()) {
			query.set('search', search.trim());
		}

		try {
			const response = await fetch(`/api/v1/admin/users?${query.toString()}`);
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_load_users();
				users = [];
				total = 0;
				return;
			}

			const data = body.data as ListUsersResponse;
			users = Array.isArray(data?.users) ? data.users : [];
			total = typeof data?.total === 'number' ? data.total : users.length;
		} catch {
			errorMessage = m.admin_failed_load_users();
			users = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	async function updateRole(userId: string, role: string) {
		updatingUserId = userId;
		errorMessage = '';
		successMessage = '';

		try {
			const response = await fetch(`/api/v1/admin/users/${userId}/role`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ role })
			});

			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_update_role();
				return;
			}

			successMessage = m.admin_role_updated();
			await loadUsers();
		} catch {
			errorMessage = m.admin_failed_update_role();
		} finally {
			updatingUserId = null;
		}
	}

	async function toggleUserSuspension(user: AdminUser) {
		actingUserId = user.id;
		errorMessage = '';
		successMessage = '';

		try {
			if (user.banned) {
				const result = await authClient.admin.unbanUser({ userId: user.id });
				if (result.error) {
					errorMessage = result.error.message ?? m.admin_failed_unsuspend_user();
					return;
				}

				successMessage = m.admin_user_unsuspended();
			} else {
				const result = await authClient.admin.banUser({
					userId: user.id,
					banReason: m.admin_ban_reason_suspended_by_admin()
				});
				if (result.error) {
					errorMessage = result.error.message ?? m.admin_failed_suspend_user();
					return;
				}

				successMessage = m.admin_user_suspended();
			}

			await loadUsers();
		} catch {
			errorMessage = user.banned ? m.admin_failed_unsuspend_user() : m.admin_failed_suspend_user();
		} finally {
			actingUserId = null;
		}
	}

	async function loadAuthSettings() {
		authSettingsLoading = true;

		try {
			const response = await fetch('/api/v1/admin/auth-settings');
			const body = await response.json().catch(() => ({}));

			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_load_auth_settings();
				return;
			}

			const settings = (body.data ?? {}) as Partial<AdminAuthSettings>;
			registrationEnabled = Boolean(settings.registrationEnabled);
			anonymousTokensEnabled = Boolean(settings.anonymousTokensEnabled);
			availableSocialProviders = parseProviderIds(settings.availableSocialProviders);
			enabledSocialProviders = parseProviderIds(settings.enabledSocialProviders).filter(
				(provider) => availableSocialProviders.includes(provider)
			);
		} catch {
			errorMessage = m.admin_failed_load_auth_settings();
		} finally {
			authSettingsLoading = false;
		}
	}

	function toggleSocialProvider(provider: SocialProviderId, checked: boolean) {
		if (checked) {
			enabledSocialProviders = Array.from(new Set([...enabledSocialProviders, provider]));
			return;
		}

		enabledSocialProviders = enabledSocialProviders.filter((value) => value !== provider);
	}

	async function saveAuthSettings() {
		errorMessage = '';
		successMessage = '';
		savingAuthSettings = true;

		try {
			const response = await fetch('/api/v1/admin/auth-settings', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					registrationEnabled,
					anonymousTokensEnabled,
					enabledSocialProviders
				})
			});

			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_save_auth_settings();
				return;
			}

			successMessage = m.admin_auth_settings_saved();
			await loadAuthSettings();
		} catch {
			errorMessage = m.admin_failed_save_auth_settings();
		} finally {
			savingAuthSettings = false;
		}
	}

	async function impersonateUser(user: AdminUser) {
		actingUserId = user.id;
		errorMessage = '';
		successMessage = '';

		try {
			const result = await authClient.admin.impersonateUser({ userId: user.id });
			if (result.error) {
				errorMessage = result.error.message ?? m.admin_failed_impersonate_user();
				return;
			}

			successMessage = m.admin_now_impersonating({ email: user.email });
			await goto(resolve('/'));
		} catch {
			errorMessage = m.admin_failed_impersonate_user();
		} finally {
			actingUserId = null;
		}
	}

	async function loadBranding() {
		brandingLoading = true;
		try {
			const response = await fetch('/api/v1/admin/branding');
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_load_branding();
				return;
			}

			brandingAppName = body.data?.appName ?? m.app_name();
			brandingTagline = body.data?.tagline ?? '';
			brandingLogoUrl = body.data?.logoUrl ?? '';
			brandingFaviconUrl = body.data?.faviconUrl ?? '';
			brandingDisableIndexing = Boolean(body.data?.disableIndexing);
		} catch {
			errorMessage = m.admin_failed_load_branding();
		} finally {
			brandingLoading = false;
		}
	}

	async function saveBranding() {
		errorMessage = '';
		successMessage = '';
		savingBranding = true;

		try {
			const response = await fetch('/api/v1/admin/branding', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					appName: brandingAppName,
					tagline: brandingTagline,
					logoUrl: brandingLogoUrl,
					faviconUrl: brandingFaviconUrl,
					disableIndexing: brandingDisableIndexing
				})
			});

			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_failed_save_branding();
				return;
			}

			successMessage = m.admin_branding_saved();
		} catch {
			errorMessage = m.admin_failed_save_branding();
		} finally {
			savingBranding = false;
		}
	}

	async function loadMaintenanceStatus() {
		maintenanceStatusLoading = true;

		try {
			const response = await fetch('/api/v1/admin/maintenance');
			const body = await response.json().catch(() => ({}));

			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_maintenance_status_load_failed();
				maintenanceStatus = [];
				return;
			}

			maintenanceStatus = Array.isArray(body?.data?.queues) ? body.data.queues : [];
			maintenanceStatusRefreshedAt =
				typeof body?.data?.refreshedAt === 'string' ? body.data.refreshedAt : null;
		} catch {
			errorMessage = m.admin_maintenance_status_load_failed();
			maintenanceStatus = [];
		} finally {
			maintenanceStatusLoading = false;
		}
	}

	async function runMaintenanceJob(job: 'expire-unused-uploads' | 'expire-expired-shares' | 'all') {
		errorMessage = '';
		successMessage = '';
		queueingMaintenance = job;

		const jobs = job === 'all' ? ['expire-unused-uploads', 'expire-expired-shares'] : [job];

		try {
			const response = await fetch('/api/v1/admin/maintenance', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ jobs })
			});

			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.admin_maintenance_failed_queue();
				return;
			}

			const queued = Array.isArray(body?.data?.queued) ? body.data.queued.length : 0;
			successMessage =
				queued > 0
					? m.admin_maintenance_queued_count({ count: queued })
					: m.admin_maintenance_queued_default();
			await loadMaintenanceStatus();
		} catch {
			errorMessage = m.admin_maintenance_failed_queue();
		} finally {
			queueingMaintenance = null;
		}
	}

	function maintenanceJobLabel(job: MaintenanceQueueStatus['job']) {
		if (job === 'expire-unused-uploads') {
			return m.admin_maintenance_queue_unused_uploads();
		}

		return m.admin_maintenance_queue_expired_shares();
	}

	function formatDate(value: string) {
		return new Date(value).toLocaleString();
	}

	onMount(() => {
		void loadUsers();
		void loadBranding();
		void loadAuthSettings();
		void loadMaintenanceStatus();
	});
</script>

<svelte:head>
	<title>{m.admin_title()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mb-6">
	<h1 class="text-2xl font-bold">{m.admin_title()}</h1>
	<p class="text-sm text-base-content/70">{m.admin_subtitle()}</p>
</section>

{#if errorMessage}
	<div role="alert" class="mb-4 alert alert-error"><span>{errorMessage}</span></div>
{/if}

{#if successMessage}
	<div role="alert" class="mb-4 alert alert-success"><span>{successMessage}</span></div>
{/if}

{#if data.updateStatus}
	<section class="card mb-6 border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="card-title">Updates</h2>
				<button
					class="btn btn-ghost btn-sm"
					type="button"
					onclick={() => {
						window.open(data.updateStatus.repositoryUrl, '_blank', 'noopener,noreferrer');
					}}
				>
					<Icon icon="mdi:source-repository" class="h-4 w-4" />
					Repository
				</button>
			</div>

			{#if data.updateStatus.hasUpdate}
				<div role="alert" class="alert alert-warning">
					<span>
						Update available: {data.updateStatus.latestVersion ?? 'unknown'} (current {data
							.updateStatus.currentVersion}).
					</span>
				</div>
				{#if data.updateStatus.latestReleaseUrl}
					<div class="card-actions justify-end">
						<button
							class="btn btn-sm btn-primary"
							type="button"
							onclick={() => {
								window.open(
									data.updateStatus.latestReleaseUrl ??
										'https://git.codeguilds.org/Mitchell/kite/releases/latest',
									'_blank',
									'noopener,noreferrer'
								);
							}}
						>
							<Icon icon="mdi:open-in-new" class="h-4 w-4" />
							Open latest release
						</button>
					</div>
				{/if}
			{:else if data.updateStatus.error}
				<div role="alert" class="alert alert-info">
					<span>
						Unable to check releases right now (current {data.updateStatus.currentVersion}).
					</span>
				</div>
			{:else}
				<div role="alert" class="alert alert-success">
					<span>Kite is up to date ({data.updateStatus.currentVersion}).</span>
				</div>
			{/if}

			<p class="text-xs text-base-content/60">
				Last checked: {formatDate(data.updateStatus.checkedAt)}
			</p>
		</div>
	</section>
{/if}

<section class="card border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div class="flex flex-wrap items-end justify-between gap-3">
			<fieldset class="fieldset w-full max-w-md">
				<legend class="fieldset-legend">{m.admin_search_email()}</legend>
				<div class="join w-full">
					<input
						class="input-bordered input join-item w-full"
						type="search"
						bind:value={search}
						placeholder={m.admin_search_placeholder()}
					/>
					<button class="btn join-item" type="button" onclick={loadUsers} disabled={loading}>
						<Icon icon="mdi:magnify" class="h-4 w-4" />
						{m.admin_search_action()}
					</button>
				</div>
			</fieldset>

			<div class="badge badge-outline">{m.admin_total({ total })}</div>
		</div>

		{#if loading}
			<div class="flex items-center gap-2">
				<span class="loading loading-md loading-spinner"></span>
				<span>{m.admin_loading_users()}</span>
			</div>
		{:else if users.length === 0}
			<div class="alert">
				<span>{m.admin_no_users_found()}</span>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th>{m.admin_col_name()}</th>
							<th>{m.admin_col_email()}</th>
							<th>{m.admin_col_role()}</th>
							<th>{m.admin_col_status()}</th>
							<th>{m.admin_col_actions()}</th>
							<th>{m.admin_col_created()}</th>
						</tr>
					</thead>
					<tbody>
						{#each users as user (user.id)}
							<tr>
								<td>{user.name}</td>
								<td class="font-mono text-xs sm:text-sm">{user.email}</td>
								<td>
									<select
										class="select-bordered select select-sm"
										value={user.role ?? 'user'}
										onchange={(event) =>
											updateRole(user.id, (event.currentTarget as HTMLSelectElement).value)}
										disabled={updatingUserId === user.id}
									>
										<option value="user">{m.admin_role_user()}</option>
										<option value="trusted">{m.admin_role_trusted()}</option>
										<option value="admin">{m.admin_role_admin()}</option>
									</select>
								</td>
								<td>
									{#if user.banned}
										<span class="badge badge-outline badge-error">{m.admin_status_banned()}</span>
									{:else}
										<span class="badge badge-outline badge-success">{m.admin_status_active()}</span>
									{/if}
								</td>
								<td>
									<div class="flex flex-wrap gap-2">
										<button
											class="btn btn-outline btn-xs"
											type="button"
											onclick={() => impersonateUser(user)}
											disabled={actingUserId === user.id ||
												user.banned ||
												user.id === data.user?.id}
										>
											<Icon icon="mdi:account-switch-outline" class="h-3 w-3" />
											{m.admin_action_impersonate()}
										</button>
										<button
											class={user.banned ? 'btn btn-xs btn-success' : 'btn btn-xs btn-warning'}
											type="button"
											onclick={() => toggleUserSuspension(user)}
											disabled={actingUserId === user.id || user.id === data.user?.id}
										>
											<Icon
												icon={user.banned
													? 'mdi:account-check-outline'
													: 'mdi:account-cancel-outline'}
												class="h-3 w-3"
											/>
											{user.banned ? m.admin_action_unsuspend() : m.admin_action_suspend()}
										</button>
									</div>
								</td>
								<td>{formatDate(user.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div>
			<h2 class="card-title">{m.admin_branding_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_branding_subtitle()}</p>
		</div>

		{#if brandingLoading}
			<div class="flex items-center gap-2">
				<span class="loading loading-md loading-spinner"></span>
				<span>{m.admin_loading_branding()}</span>
			</div>
		{:else}
			<div class="grid gap-4 sm:grid-cols-2">
				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.admin_branding_app_name()}</legend>
					<input class="input-bordered input w-full" type="text" bind:value={brandingAppName} />
				</fieldset>

				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.admin_branding_tagline()}</legend>
					<input class="input-bordered input w-full" type="text" bind:value={brandingTagline} />
				</fieldset>

				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.admin_branding_logo_url()}</legend>
					<input class="input-bordered input w-full" type="url" bind:value={brandingLogoUrl} />
				</fieldset>

				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.admin_branding_favicon_url()}</legend>
					<input class="input-bordered input w-full" type="url" bind:value={brandingFaviconUrl} />
				</fieldset>

				<fieldset class="fieldset sm:col-span-2">
					<label class="label cursor-pointer justify-start gap-3">
						<input
							type="checkbox"
							class="toggle toggle-sm"
							bind:checked={brandingDisableIndexing}
						/>
						<span class="label-text">{m.admin_branding_disable_indexing()}</span>
					</label>
				</fieldset>
			</div>

			<div class="card-actions justify-end">
				<button
					class="btn btn-primary"
					type="button"
					onclick={saveBranding}
					disabled={savingBranding}
				>
					<Icon icon="mdi:content-save-outline" class="h-4 w-4" />
					{savingBranding ? m.admin_branding_saving() : m.admin_branding_save()}
				</button>
			</div>
		{/if}
	</div>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div>
			<h2 class="card-title">{m.admin_auth_settings_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_auth_settings_subtitle()}</p>
		</div>

		{#if authSettingsLoading}
			<div class="flex items-center gap-2">
				<span class="loading loading-md loading-spinner"></span>
				<span>{m.admin_loading_auth_settings()}</span>
			</div>
		{:else}
			<div class="grid gap-4">
				<fieldset class="fieldset">
					<label class="label cursor-pointer justify-start gap-3">
						<input type="checkbox" class="toggle toggle-sm" bind:checked={registrationEnabled} />
						<span class="label-text">{m.admin_auth_registration_enabled()}</span>
					</label>
					<p class="text-xs text-base-content/70">{m.admin_auth_registration_help()}</p>
				</fieldset>

				<fieldset class="fieldset">
					<label class="label cursor-pointer justify-start gap-3">
						<input type="checkbox" class="toggle toggle-sm" bind:checked={anonymousTokensEnabled} />
						<span class="label-text">{m.admin_auth_anonymous_tokens_enabled()}</span>
					</label>
					<p class="text-xs text-base-content/70">{m.admin_auth_anonymous_tokens_help()}</p>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.admin_auth_social_providers()}</legend>
					{#if availableSocialProviders.length === 0}
						<p class="text-sm text-base-content/70">{m.admin_auth_no_configured_providers()}</p>
					{:else}
						<div class="grid gap-2 sm:grid-cols-2">
							{#each availableSocialProviders as provider (provider)}
								<label class="label cursor-pointer justify-start gap-3">
									<input
										type="checkbox"
										class="checkbox checkbox-sm"
										checked={enabledSocialProviders.includes(provider)}
										onchange={(event) =>
											toggleSocialProvider(
												provider,
												(event.currentTarget as HTMLInputElement).checked
											)}
									/>
									<span class="label-text">{providerLabel(provider)}</span>
								</label>
							{/each}
						</div>
					{/if}
				</fieldset>
			</div>

			<div class="card-actions justify-end">
				<button
					class="btn btn-primary"
					type="button"
					onclick={saveAuthSettings}
					disabled={savingAuthSettings}
				>
					<Icon icon="mdi:content-save-outline" class="h-4 w-4" />
					{savingAuthSettings ? m.admin_auth_settings_saving() : m.admin_auth_settings_save()}
				</button>
			</div>
		{/if}
	</div>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div>
			<h2 class="card-title">{m.admin_maintenance_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_maintenance_subtitle()}</p>
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-outline"
				type="button"
				onclick={() => runMaintenanceJob('expire-unused-uploads')}
				disabled={queueingMaintenance !== null}
			>
				<Icon icon="mdi:timer-sand" class="h-4 w-4" />
				{queueingMaintenance === 'expire-unused-uploads'
					? m.admin_maintenance_queueing()
					: m.admin_maintenance_expire_unused_files()}
			</button>

			<button
				class="btn btn-outline"
				type="button"
				onclick={() => runMaintenanceJob('expire-expired-shares')}
				disabled={queueingMaintenance !== null}
			>
				<Icon icon="mdi:link-off" class="h-4 w-4" />
				{queueingMaintenance === 'expire-expired-shares'
					? m.admin_maintenance_queueing()
					: m.admin_maintenance_expire_old_shares()}
			</button>

			<button
				class="btn btn-primary"
				type="button"
				onclick={() => runMaintenanceJob('all')}
				disabled={queueingMaintenance !== null}
			>
				<Icon icon="mdi:play-circle-outline" class="h-4 w-4" />
				{queueingMaintenance === 'all'
					? m.admin_maintenance_queueing()
					: m.admin_maintenance_run_all()}
			</button>
		</div>

		<div class="divider my-0"></div>

		<div>
			<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
				<div>
					<h3 class="font-semibold">{m.admin_maintenance_status_title()}</h3>
					<p class="text-sm text-base-content/70">{m.admin_maintenance_status_subtitle()}</p>
				</div>
				<button
					class="btn btn-outline btn-sm"
					type="button"
					onclick={loadMaintenanceStatus}
					disabled={maintenanceStatusLoading}
				>
					<Icon icon="mdi:refresh" class="h-4 w-4" />
					{maintenanceStatusLoading
						? m.admin_maintenance_refreshing_status()
						: m.admin_maintenance_refresh_status()}
				</button>
			</div>

			{#if maintenanceStatusRefreshedAt}
				<p class="mb-3 text-xs text-base-content/60">
					{m.admin_maintenance_last_refreshed({
						time: new Date(maintenanceStatusRefreshedAt).toLocaleString()
					})}
				</p>
			{/if}

			{#if maintenanceStatus.length === 0}
				<p class="text-sm text-base-content/70">{m.admin_maintenance_status_empty()}</p>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2">
					{#each maintenanceStatus as queue (queue.job)}
						<div class="rounded-box border border-base-300 p-3">
							<div class="mb-2 flex items-center justify-between gap-2">
								<p class="font-medium">{maintenanceJobLabel(queue.job)}</p>
								<span
									class={queue.isPaused
										? 'badge badge-outline badge-warning'
										: 'badge badge-outline badge-success'}
								>
									{queue.isPaused ? m.admin_maintenance_paused() : m.admin_maintenance_running()}
								</span>
							</div>
							<div class="grid grid-cols-2 gap-2 text-xs">
								<div>{m.admin_maintenance_count_waiting()}: {queue.counts.waiting}</div>
								<div>{m.admin_maintenance_count_active()}: {queue.counts.active}</div>
								<div>{m.admin_maintenance_count_delayed()}: {queue.counts.delayed}</div>
								<div>{m.admin_maintenance_count_completed()}: {queue.counts.completed}</div>
								<div>{m.admin_maintenance_count_failed()}: {queue.counts.failed}</div>
								<div>{m.admin_maintenance_count_paused()}: {queue.counts.paused}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</section>
