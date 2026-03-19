<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve */
	import Icon from '@iconify/svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';

	type AdminUser = {
		id: string;
		email: string;
		name: string;
		role: string | null;
		banned?: boolean | null;
		createdAt: string;
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
		latestResult: {
			expiredUploads?: number;
			removedFromDisk?: number;
			expiredShares?: number;
			expiredHighSensitivityShares?: number;
		} | null;
	};

	type SocialProviderId =
		| 'apple'
		| 'discord'
		| 'facebook'
		| 'github'
		| 'gitlab'
		| 'google'
		| 'microsoft';

	type AlertType = 'info' | 'success' | 'warning' | 'error';

	type AuditLogEntry = {
		id: string;
		actorId: string | null;
		action: string;
		resourceType: string | null;
		resourceId: string | null;
		payload: {
			request?: {
				id?: string;
				method?: string;
				path?: string;
				status?: number;
				durationMs?: number;
				ipAddress?: string | null;
				userAgent?: string | null;
				body?: unknown;
			};
			response?: {
				body?: unknown;
			};
			resource?: {
				type?: string | null;
				id?: string | null;
			};
		} | null;
		createdAt: string;
		actorEmail: string | null;
		actorName: string | null;
	};

	let { data } = $props();

	let errorMessage = $state('');
	let successMessage = $state('');

	let users = $derived<AdminUser[]>(data.users ?? []);
	let total = $derived<number>(data.total ?? 0);
	let userFilters = $derived<{ search: string; role: string; status: string }>(
		data.userFilters ?? { search: '', role: '', status: '' }
	);
	let userPagination = $derived<{
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
		hasPrev: boolean;
		hasNext: boolean;
	}>(
		data.userPagination ?? {
			page: 1,
			pageSize: 25,
			total: 0,
			totalPages: 1,
			hasPrev: false,
			hasNext: false
		}
	);

	function getInitialBranding() {
		return data.brandingSettings ?? {};
	}

	function getInitialAuthSettings() {
		return data.authSettingsData ?? {};
	}

	function getInitialAlertSettings() {
		return data.alertSettingsData ?? {};
	}

	let brandingAppName = $state(getInitialBranding().appName ?? m.app_name());
	let brandingTagline = $state(getInitialBranding().tagline ?? '');
	let brandingLogoUrl = $state(getInitialBranding().logoUrl ?? '');
	let brandingFaviconUrl = $state(getInitialBranding().faviconUrl ?? '');
	let brandingDisableIndexing = $state(Boolean(getInitialBranding().disableIndexing));

	let registrationEnabled = $state(Boolean(getInitialAuthSettings().registrationEnabled));
	let anonymousTokensEnabled = $state(Boolean(getInitialAuthSettings().anonymousTokensEnabled));
	let publicApiEnabled = $state(Boolean(getInitialAuthSettings().publicApiEnabled ?? true));
	let availableSocialProviders = $state<SocialProviderId[]>(
		getInitialAuthSettings().availableSocialProviders ?? []
	);
	let enabledSocialProviders = $state<SocialProviderId[]>(
		getInitialAuthSettings().enabledSocialProviders ?? []
	);

	let globalAnnouncementEnabled = $state(
		Boolean(getInitialAlertSettings().globalAnnouncement?.enabled)
	);
	let globalAnnouncementMessage = $state(
		getInitialAlertSettings().globalAnnouncement?.message ?? ''
	);
	let globalAnnouncementType = $state<AlertType>(
		getInitialAlertSettings().globalAnnouncement?.type ?? 'info'
	);
	let shareFlowAlertEnabled = $state(Boolean(getInitialAlertSettings().shareFlowAlert?.enabled));
	let shareFlowAlertMessage = $state(getInitialAlertSettings().shareFlowAlert?.message ?? '');
	let shareFlowAlertType = $state<AlertType>(
		getInitialAlertSettings().shareFlowAlert?.type ?? 'info'
	);

	// Keep form state aligned with refreshed server data after successful saves.
	$effect(() => {
		if (!data?.brandingSettings) return;
		const b = getInitialBranding();
		brandingAppName = b.appName ?? m.app_name();
		brandingTagline = b.tagline ?? '';
		brandingLogoUrl = b.logoUrl ?? '';
		brandingFaviconUrl = b.faviconUrl ?? '';
		brandingDisableIndexing = Boolean(b.disableIndexing);
	});

	$effect(() => {
		if (!data?.authSettingsData) return;
		const a = getInitialAuthSettings();
		registrationEnabled = Boolean(a.registrationEnabled);
		anonymousTokensEnabled = Boolean(a.anonymousTokensEnabled);
		publicApiEnabled = Boolean(a.publicApiEnabled ?? true);
		availableSocialProviders = a.availableSocialProviders ?? [];
		enabledSocialProviders = a.enabledSocialProviders ?? [];
	});

	$effect(() => {
		if (!data?.alertSettingsData) return;
		const s = getInitialAlertSettings();
		globalAnnouncementEnabled = Boolean(s.globalAnnouncement?.enabled);
		globalAnnouncementMessage = s.globalAnnouncement?.message ?? '';
		globalAnnouncementType = s.globalAnnouncement?.type ?? 'info';
		shareFlowAlertEnabled = Boolean(s.shareFlowAlert?.enabled);
		shareFlowAlertMessage = s.shareFlowAlert?.message ?? '';
		shareFlowAlertType = s.shareFlowAlert?.type ?? 'info';
	});

	let maintenanceQueues = $derived<MaintenanceQueueStatus[]>(data.maintenanceData?.queues ?? []);
	let maintenanceRefreshedAt = $derived<string | null>(data.maintenanceData?.refreshedAt ?? null);
	let auditLogs = $derived<AuditLogEntry[]>(data.auditLogsData?.logs ?? []);
	let auditFilters = $derived<{
		q: string;
		action: string;
		method: string;
		path: string;
		status: string;
		actorId: string;
		from: string;
		to: string;
	}>(
		data.auditFilters ?? {
			q: '',
			action: '',
			method: '',
			path: '',
			status: '',
			actorId: '',
			from: '',
			to: ''
		}
	);
	let auditPagination = $derived<{
		page: number;
		pageSize: number;
		total: number;
		totalPages: number;
		hasPrev: boolean;
		hasNext: boolean;
	}>(
		data.auditPagination ?? {
			page: 1,
			pageSize: 50,
			total: 0,
			totalPages: 1,
			hasPrev: false,
			hasNext: false
		}
	);
	let auditDetailEntry = $state<AuditLogEntry | null>(null);
	let auditDetailDialog = $state<HTMLDialogElement | null>(null);

	const ALERT_TYPES: AlertType[] = ['info', 'success', 'warning', 'error'];

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

	function maintenanceJobLabel(job: MaintenanceQueueStatus['job']) {
		if (job === 'expire-unused-uploads') {
			return m.admin_maintenance_queue_unused_uploads();
		}

		return m.admin_maintenance_queue_expired_shares();
	}

	function formatDate(value: string) {
		return new Date(value).toLocaleString();
	}

	function toPrettyJson(value: unknown) {
		if (value === null || value === undefined) {
			return '';
		}

		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function actionBadgeClass(action: string) {
		if (action.includes('.failed') || action.includes('.error')) {
			return 'border border-rose-300 bg-rose-100 text-rose-900';
		}

		if (action.startsWith('auth.')) {
			return 'border border-sky-300 bg-sky-100 text-sky-900';
		}

		if (action.startsWith('share.')) {
			return 'border border-emerald-300 bg-emerald-100 text-emerald-900';
		}

		if (action.startsWith('upload.')) {
			return 'border border-violet-300 bg-violet-100 text-violet-900';
		}

		if (action.startsWith('share_request.')) {
			return 'border border-cyan-300 bg-cyan-100 text-cyan-900';
		}

		if (action.startsWith('user.')) {
			return 'border border-amber-300 bg-amber-100 text-amber-900';
		}

		if (action.startsWith('admin.settings.')) {
			return 'border border-indigo-300 bg-indigo-100 text-indigo-900';
		}

		if (action.startsWith('admin.maintenance.')) {
			return 'border border-lime-300 bg-lime-100 text-lime-900';
		}

		if (action.startsWith('http.')) {
			return 'border border-slate-300 bg-slate-100 text-slate-900';
		}

		return 'border border-zinc-300 bg-zinc-100 text-zinc-900';
	}

	function buildAdminQuery(
		page: number,
		section: 'user-management' | 'audit-log',
		isAuditPage: boolean
	) {
		const params: Array<[string, string]> = [];

		if (userFilters.search) params.push(['search', userFilters.search]);
		if (userFilters.role) params.push(['userRole', userFilters.role]);
		if (userFilters.status) params.push(['userStatus', userFilters.status]);
		params.push(['userPageSize', String(userPagination.pageSize)]);
		params.push(['userPage', String(isAuditPage ? userPagination.page : page)]);

		if (auditFilters.q) params.push(['auditQ', auditFilters.q]);
		if (auditFilters.action) params.push(['auditAction', auditFilters.action]);
		if (auditFilters.method) params.push(['auditMethod', auditFilters.method]);
		if (auditFilters.path) params.push(['auditPath', auditFilters.path]);
		if (auditFilters.status) params.push(['auditStatus', auditFilters.status]);
		if (auditFilters.actorId) params.push(['auditActorId', auditFilters.actorId]);
		if (auditFilters.from) params.push(['auditFrom', auditFilters.from]);
		if (auditFilters.to) params.push(['auditTo', auditFilters.to]);
		params.push(['auditPageSize', String(auditPagination.pageSize)]);
		params.push(['auditPage', String(isAuditPage ? page : auditPagination.page)]);

		const query = params
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');

		return `${resolve('/admin')}?${query}#${section}`;
	}

	function statusBadgeClass(status?: number) {
		if (!status) return 'badge-outline';
		if (status >= 500) return 'badge-error';
		if (status >= 400) return 'badge-warning';
		if (status >= 200) return 'badge-success';
		return 'badge-outline';
	}

	function openAuditDetails(entry: AuditLogEntry) {
		auditDetailEntry = entry;
		auditDetailDialog?.showModal();
	}

	function closeAuditDetails() {
		auditDetailDialog?.close();
		auditDetailEntry = null;
	}

	function auditActorLabel(entry: AuditLogEntry) {
		if (entry.actorName && entry.actorEmail) {
			return `${entry.actorName} <${entry.actorEmail}>`;
		}

		if (entry.actorEmail) {
			return entry.actorEmail;
		}

		if (entry.actorId) {
			return entry.actorId;
		}

		return 'Anonymous/System';
	}

	function toAuditPageHref(page: number) {
		return buildAdminQuery(page, 'audit-log', true);
	}

	function toUserPageHref(page: number) {
		return buildAdminQuery(page, 'user-management', false);
	}

	function truncateUserId(id: string) {
		if (id.length <= 16) return id;
		return `${id.slice(0, 8)}…${id.slice(-7)}`;
	}

	type EnhanceResult = {
		result: { type: string; data?: { errorMessage?: string; successMessage?: string } };
		update: (options?: { reset?: boolean; invalidateAll?: boolean }) => Promise<void>;
	};

	function handleActionResult(defaultError: string, defaultSuccess: string) {
		return async ({ result, update }: EnhanceResult) => {
			await update({ reset: false, invalidateAll: false });
			if (result.type === 'failure') {
				errorMessage = result.data?.errorMessage ?? defaultError;
				successMessage = '';
				return;
			}

			if (result.type === 'success') {
				errorMessage = '';
				successMessage = result.data?.successMessage ?? defaultSuccess;
				await invalidateAll();
			}
		};
	}
</script>

<svelte:head>
	<title>{m.admin_title()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mb-6">
	<h1 class="text-2xl font-bold">{m.admin_title()}</h1>
	<p class="text-sm text-base-content/70">{m.admin_subtitle()}</p>
</section>

{#if errorMessage || data.loadErrors?.users || data.loadErrors?.branding || data.loadErrors?.authSettings || data.loadErrors?.alertSettings || data.loadErrors?.maintenance || data.loadErrors?.auditLogs}
	<div role="alert" class="mb-4 alert alert-error">
		<span
			>{errorMessage ||
				data.loadErrors?.users ||
				data.loadErrors?.branding ||
				data.loadErrors?.authSettings ||
				data.loadErrors?.alertSettings ||
				data.loadErrors?.maintenance ||
				data.loadErrors?.auditLogs}</span
		>
	</div>
{/if}

{#if successMessage}
	<div role="alert" class="mb-4 alert alert-success"><span>{successMessage}</span></div>
{/if}

{#if data.updateStatus}
	<section class="card mb-6 border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-3">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 class="card-title">{m.admin_updates_title()}</h2>
				<button
					class="btn btn-ghost btn-sm"
					type="button"
					onclick={() => {
						window.open(data.updateStatus.repositoryUrl, '_blank', 'noopener,noreferrer');
					}}
				>
					<Icon icon="mdi:source-repository" class="h-4 w-4" />
					{m.admin_updates_repository()}
				</button>
			</div>

			{#if data.updateStatus.hasUpdate}
				<div role="alert" class="alert alert-warning">
					<span>
						{m.admin_updates_available({
							latestVersion: data.updateStatus.latestVersion ?? m.common_unknown(),
							currentVersion: data.updateStatus.currentVersion
						})}
					</span>
				</div>
			{:else if data.updateStatus.error}
				<div role="alert" class="alert alert-info">
					<span
						>{m.admin_updates_check_failed({
							currentVersion: data.updateStatus.currentVersion
						})}</span
					>
				</div>
			{:else}
				<div role="alert" class="alert alert-success">
					<span>
						{m.admin_updates_up_to_date({
							appName: data.branding?.appName || m.app_name(),
							currentVersion: data.updateStatus.currentVersion
						})}
					</span>
				</div>
			{/if}

			<p class="text-xs text-base-content/60">
				{m.admin_updates_last_checked({ time: formatDate(data.updateStatus.checkedAt) })}
			</p>
		</div>
	</section>
{/if}

<section id="user-management" class="card border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<form
			method="GET"
			action={`${resolve('/admin')}#user-management`}
			class="flex flex-wrap items-end justify-between gap-3"
		>
			<fieldset class="fieldset w-full max-w-md">
				<legend class="fieldset-legend">{m.admin_search_email()}</legend>
				<div class="join w-full">
					<input type="hidden" name="userPage" value="1" />
					<input type="hidden" name="auditQ" value={auditFilters.q} />
					<input type="hidden" name="auditAction" value={auditFilters.action} />
					<input type="hidden" name="auditMethod" value={auditFilters.method} />
					<input type="hidden" name="auditPath" value={auditFilters.path} />
					<input type="hidden" name="auditStatus" value={auditFilters.status} />
					<input type="hidden" name="auditActorId" value={auditFilters.actorId} />
					<input type="hidden" name="auditFrom" value={auditFilters.from} />
					<input type="hidden" name="auditTo" value={auditFilters.to} />
					<input type="hidden" name="auditPage" value={String(auditPagination.page)} />
					<input type="hidden" name="auditPageSize" value={String(auditPagination.pageSize)} />
					<input
						class="input-bordered input join-item w-full"
						type="search"
						name="search"
						value={userFilters.search ?? ''}
						placeholder={m.admin_search_placeholder()}
					/>
					<button class="btn join-item" type="submit">
						<Icon icon="mdi:magnify" class="h-4 w-4" />
						{m.admin_search_action()}
					</button>
				</div>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Role</legend>
				<select class="select-bordered select select-sm" name="userRole" value={userFilters.role}>
					<option value="">Any</option>
					<option value="user">{m.admin_role_user()}</option>
					<option value="trusted">{m.admin_role_trusted()}</option>
					<option value="admin">{m.admin_role_admin()}</option>
				</select>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Status</legend>
				<select
					class="select-bordered select select-sm"
					name="userStatus"
					value={userFilters.status}
				>
					<option value="">Any</option>
					<option value="active">{m.admin_status_active()}</option>
					<option value="banned">{m.admin_status_banned()}</option>
				</select>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Page size</legend>
				<select
					class="select-bordered select select-sm"
					name="userPageSize"
					value={String(userPagination.pageSize)}
				>
					<option value="10">10</option>
					<option value="25">25</option>
					<option value="50">50</option>
					<option value="100">100</option>
				</select>
			</fieldset>
			<div class="badge badge-outline">{m.admin_total({ total })}</div>
		</form>

		{#if users.length === 0}
			<div class="alert">
				<span>{m.admin_no_users_found()}</span>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th>ID</th>
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
								<td class="font-mono text-xs">
									<div class="group inline-block">
										<span class="select-none group-hover:hidden">{truncateUserId(user.id)}</span>
										<span class="hidden whitespace-nowrap select-text group-hover:inline">
											{user.id}
										</span>
									</div>
								</td>
								<td>{user.name}</td>
								<td class="font-mono text-xs sm:text-sm">{user.email}</td>
								<td>
									<form
										method="POST"
										action="?/updateRole"
										use:enhance={() =>
											handleActionResult(m.admin_failed_update_role(), m.admin_role_updated())}
									>
										<input type="hidden" name="userId" value={user.id} />
										<select
											class="select-bordered select select-sm"
											name="role"
											value={user.role ?? 'user'}
										>
											<option value="user">{m.admin_role_user()}</option>
											<option value="trusted">{m.admin_role_trusted()}</option>
											<option value="admin">{m.admin_role_admin()}</option>
										</select>
										<button class="btn btn-ghost btn-xs" type="submit">{m.action_save()}</button>
									</form>
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
										<form
											method="POST"
											action="?/impersonate"
											use:enhance={() =>
												handleActionResult(
													m.admin_failed_impersonate_user(),
													m.admin_action_impersonate()
												)}
										>
											<input type="hidden" name="userId" value={user.id} />
											<button
												class="btn btn-outline btn-xs"
												type="submit"
												disabled={user.banned || user.id === data.user?.id}
											>
												<Icon icon="mdi:account-switch-outline" class="h-3 w-3" />
												{m.admin_action_impersonate()}
											</button>
										</form>
										<form
											method="POST"
											action="?/toggleSuspension"
											use:enhance={() =>
												handleActionResult(
													user.banned
														? m.admin_failed_unsuspend_user()
														: m.admin_failed_suspend_user(),
													user.banned ? m.admin_user_unsuspended() : m.admin_user_suspended()
												)}
										>
											<input type="hidden" name="userId" value={user.id} />
											<input type="hidden" name="banned" value={user.banned ? 'true' : 'false'} />
											<button
												class={user.banned ? 'btn btn-xs btn-success' : 'btn btn-xs btn-warning'}
												type="submit"
												disabled={user.id === data.user?.id}
											>
												<Icon
													icon={user.banned
														? 'mdi:account-check-outline'
														: 'mdi:account-cancel-outline'}
													class="h-3 w-3"
												/>
												{user.banned ? m.admin_action_unsuspend() : m.admin_action_suspend()}
											</button>
										</form>
									</div>
								</td>
								<td>{formatDate(user.createdAt)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-3">
				<div class="text-sm text-base-content/70">
					Page {userPagination.page} of {userPagination.totalPages}
				</div>
				<div class="join">
					<a
						class="btn join-item btn-sm"
						href={toUserPageHref(Math.max(1, userPagination.page - 1))}
						aria-disabled={!userPagination.hasPrev}
					>
						Previous
					</a>
					<a
						class="btn join-item btn-sm"
						href={toUserPageHref(Math.min(userPagination.totalPages, userPagination.page + 1))}
						aria-disabled={!userPagination.hasNext}
					>
						Next
					</a>
				</div>
			</div>
		{/if}
	</div>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<form
		method="POST"
		action="?/saveBranding"
		class="card-body gap-4"
		use:enhance={() => handleActionResult(m.admin_failed_save_branding(), m.admin_branding_saved())}
	>
		<div>
			<h2 class="card-title">{m.admin_branding_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_branding_subtitle()}</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2">
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.admin_branding_app_name()}</legend>
				<input
					class="input-bordered input w-full"
					type="text"
					name="appName"
					bind:value={brandingAppName}
				/>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.admin_branding_tagline()}</legend>
				<input
					class="input-bordered input w-full"
					type="text"
					name="tagline"
					bind:value={brandingTagline}
				/>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.admin_branding_logo_url()}</legend>
				<input
					class="input-bordered input w-full"
					type="url"
					name="logoUrl"
					bind:value={brandingLogoUrl}
				/>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.admin_branding_favicon_url()}</legend>
				<input
					class="input-bordered input w-full"
					type="url"
					name="faviconUrl"
					bind:value={brandingFaviconUrl}
				/>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="disableIndexing"
						bind:checked={brandingDisableIndexing}
					/>
					<span class="label-text">{m.admin_branding_disable_indexing()}</span>
				</label>
			</fieldset>
		</div>

		<div class="card-actions justify-end">
			<button class="btn btn-primary" type="submit">
				<Icon icon="mdi:content-save-outline" class="h-4 w-4" />
				{m.admin_branding_save()}
			</button>
		</div>
	</form>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<form
		method="POST"
		action="?/saveAuthSettings"
		class="card-body gap-4"
		use:enhance={() =>
			handleActionResult(m.admin_failed_save_auth_settings(), m.admin_auth_settings_saved())}
	>
		<div>
			<h2 class="card-title">{m.admin_auth_settings_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_auth_settings_subtitle()}</p>
		</div>

		<div class="grid gap-4">
			<fieldset class="fieldset">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="registrationEnabled"
						bind:checked={registrationEnabled}
					/>
					<span class="label-text">{m.admin_auth_registration_enabled()}</span>
				</label>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="anonymousTokensEnabled"
						bind:checked={anonymousTokensEnabled}
					/>
					<span class="label-text">{m.admin_auth_anonymous_tokens_enabled()}</span>
				</label>
			</fieldset>

			<fieldset class="fieldset">
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="publicApiEnabled"
						bind:checked={publicApiEnabled}
					/>
					<span class="label-text">API access enabled</span>
				</label>
				<p class="text-xs text-base-content/70">
					When disabled, only /api/auth and /api/v1/uploads remain available.
				</p>
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
									name="enabledSocialProviders"
									value={provider}
									checked={enabledSocialProviders.includes(provider)}
								/>
								<span class="label-text">{providerLabel(provider)}</span>
							</label>
						{/each}
					</div>
				{/if}
			</fieldset>
		</div>

		<div class="card-actions justify-end">
			<button class="btn btn-primary" type="submit">
				<Icon icon="mdi:content-save-outline" class="h-4 w-4" />
				{m.admin_auth_settings_save()}
			</button>
		</div>
	</form>
</section>

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<form
		method="POST"
		action="?/saveAlertSettings"
		class="card-body gap-4"
		use:enhance={() =>
			handleActionResult(m.admin_failed_save_alert_settings(), m.admin_alert_settings_saved())}
	>
		<div>
			<h2 class="card-title">{m.admin_alert_settings_title()}</h2>
			<p class="text-sm text-base-content/70">{m.admin_alert_settings_subtitle()}</p>
		</div>

		<div class="grid gap-4">
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Global Announcement</legend>
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="globalAnnouncementEnabled"
						bind:checked={globalAnnouncementEnabled}
					/>
					<span class="label-text">{m.admin_alert_enabled()}</span>
				</label>
				<input
					class="input-bordered input w-full"
					type="text"
					name="globalAnnouncementMessage"
					bind:value={globalAnnouncementMessage}
					placeholder="Message"
				/>
				<select
					class="select-bordered select mt-2 w-full"
					name="globalAnnouncementType"
					bind:value={globalAnnouncementType}
				>
					{#each ALERT_TYPES as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Share Flow Alert</legend>
				<label class="label cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						class="toggle toggle-sm"
						name="shareFlowAlertEnabled"
						bind:checked={shareFlowAlertEnabled}
					/>
					<span class="label-text">{m.admin_alert_enabled()}</span>
				</label>
				<input
					class="input-bordered input w-full"
					type="text"
					name="shareFlowAlertMessage"
					bind:value={shareFlowAlertMessage}
					placeholder="Message"
				/>
				<select
					class="select-bordered select mt-2 w-full"
					name="shareFlowAlertType"
					bind:value={shareFlowAlertType}
				>
					{#each ALERT_TYPES as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</fieldset>
		</div>

		<div class="card-actions justify-end">
			<button class="btn btn-primary" type="submit">
				<Icon icon="mdi:content-save-outline" class="h-4 w-4" />
				{m.admin_alert_settings_save()}
			</button>
		</div>
	</form>
</section>

<section id="maintenance" class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="card-title">{m.admin_maintenance_title()}</h2>
				<p class="text-sm text-base-content/70">{m.admin_maintenance_subtitle()}</p>
			</div>
			{#if maintenanceRefreshedAt}
				<span class="text-xs text-base-content/60">{formatDate(maintenanceRefreshedAt)}</span>
			{/if}
		</div>

		<div class="flex flex-wrap gap-2">
			<form
				method="POST"
				action="?/runMaintenance"
				use:enhance={() =>
					handleActionResult(
						m.admin_maintenance_failed_queue(),
						m.admin_maintenance_queued_default()
					)}
			>
				<input type="hidden" name="job" value="expire-unused-uploads" />
				<button class="btn btn-outline btn-sm" type="submit"
					>{m.admin_maintenance_queue_unused_uploads()}</button
				>
			</form>
			<form
				method="POST"
				action="?/runMaintenance"
				use:enhance={() =>
					handleActionResult(
						m.admin_maintenance_failed_queue(),
						m.admin_maintenance_queued_default()
					)}
			>
				<input type="hidden" name="job" value="expire-expired-shares" />
				<button class="btn btn-outline btn-sm" type="submit"
					>{m.admin_maintenance_queue_expired_shares()}</button
				>
			</form>
			<form
				method="POST"
				action="?/runMaintenance"
				use:enhance={() =>
					handleActionResult(
						m.admin_maintenance_failed_queue(),
						m.admin_maintenance_queued_default()
					)}
			>
				<input type="hidden" name="job" value="all" />
				<button class="btn btn-sm btn-primary" type="submit">{m.admin_maintenance_run_all()}</button
				>
			</form>
		</div>

		{#if maintenanceQueues.length === 0}
			<div class="alert"><span>{m.admin_maintenance_queueing()}</span></div>
		{:else}
			<div class="overflow-x-auto">
				<table class="table table-zebra">
					<thead>
						<tr>
							<th>Job</th>
							<th>{m.admin_maintenance_count_waiting()}</th>
							<th>{m.admin_maintenance_count_active()}</th>
							<th>{m.admin_maintenance_count_failed()}</th>
							<th>{m.admin_maintenance_status_title()}</th>
						</tr>
					</thead>
					<tbody>
						{#each maintenanceQueues as queue (queue.job)}
							<tr>
								<td>{maintenanceJobLabel(queue.job)}</td>
								<td>{queue.counts.waiting}</td>
								<td>{queue.counts.active}</td>
								<td>{queue.counts.failed}</td>
								<td
									>{queue.isPaused
										? m.admin_maintenance_paused()
										: m.admin_maintenance_running()}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</section>

<section id="audit-log" class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h2 class="card-title">Audit log</h2>
				<p class="text-sm text-base-content/70">
					Tracks request and authentication activity for investigations and compliance.
				</p>
			</div>
			<div class="badge badge-outline badge-lg">{auditPagination.total} events</div>
		</div>

		<form method="GET" action={`${resolve('/admin')}#audit-log`} class="grid gap-3 lg:grid-cols-5">
			<input type="hidden" name="search" value={userFilters.search ?? ''} />
			<input type="hidden" name="auditPage" value="1" />

			<label class="form-control">
				<span class="label-text text-xs">Search</span>
				<input
					class="input-bordered input input-sm"
					type="search"
					name="auditQ"
					value={auditFilters.q}
					placeholder="Action, actor, path, resource"
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Action</span>
				<input
					class="input-bordered input input-sm"
					type="text"
					name="auditAction"
					value={auditFilters.action}
					placeholder="auth.sign_in"
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Method</span>
				<select
					class="select-bordered select select-sm"
					name="auditMethod"
					value={auditFilters.method}
				>
					<option value="">Any</option>
					<option value="GET">GET</option>
					<option value="POST">POST</option>
					<option value="PUT">PUT</option>
					<option value="PATCH">PATCH</option>
					<option value="DELETE">DELETE</option>
				</select>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Status</span>
				<input
					class="input-bordered input input-sm"
					type="number"
					name="auditStatus"
					value={auditFilters.status}
					min="100"
					max="599"
					placeholder="200"
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Path contains</span>
				<input
					class="input-bordered input input-sm"
					type="text"
					name="auditPath"
					value={auditFilters.path}
					placeholder="/api/auth"
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Actor ID</span>
				<input
					class="input-bordered input input-sm"
					type="text"
					name="auditActorId"
					value={auditFilters.actorId}
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">From</span>
				<input
					class="input-bordered input input-sm"
					type="datetime-local"
					name="auditFrom"
					value={auditFilters.from}
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">To</span>
				<input
					class="input-bordered input input-sm"
					type="datetime-local"
					name="auditTo"
					value={auditFilters.to}
				/>
			</label>

			<label class="form-control">
				<span class="label-text text-xs">Page size</span>
				<select
					class="select-bordered select select-sm"
					name="auditPageSize"
					value={String(auditPagination.pageSize)}
				>
					<option value="25">25</option>
					<option value="50">50</option>
					<option value="100">100</option>
					<option value="200">200</option>
				</select>
			</label>

			<div class="flex items-end gap-2 lg:col-span-2">
				<button class="btn btn-sm btn-primary" type="submit">
					<Icon icon="mdi:filter-variant" class="h-4 w-4" />
					Apply
				</button>
				<a class="btn btn-ghost btn-sm" href={resolve('/admin')}>Reset</a>
			</div>
		</form>

		{#if auditLogs.length === 0}
			<div class="alert">
				<span>No audit entries have been recorded yet.</span>
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-4">
				<div class="rounded-xl border border-base-300 bg-base-200/30 p-3 shadow-sm">
					<div class="text-xs opacity-70">Total entries</div>
					<div class="text-lg font-semibold">{auditPagination.total}</div>
				</div>
				<div class="rounded-xl border border-base-300 bg-base-200/30 p-3 shadow-sm">
					<div class="text-xs opacity-70">Page</div>
					<div class="text-lg font-semibold">{auditPagination.page}</div>
				</div>
				<div class="rounded-xl border border-base-300 bg-base-200/30 p-3 shadow-sm">
					<div class="text-xs opacity-70">Per page</div>
					<div class="text-lg font-semibold">{auditPagination.pageSize}</div>
				</div>
				<div class="rounded-xl border border-base-300 bg-base-200/30 p-3 shadow-sm">
					<div class="text-xs opacity-70">Pages</div>
					<div class="text-lg font-semibold">{auditPagination.totalPages}</div>
				</div>
			</div>

			<div class="overflow-x-auto rounded-xl border border-base-300">
				<table class="table table-zebra table-sm">
					<thead>
						<tr>
							<th>Time</th>
							<th>Action</th>
							<th>Actor</th>
							<th>Request</th>
							<th>Status</th>
							<th>Resource</th>
							<th>Details</th>
						</tr>
					</thead>
					<tbody>
						{#each auditLogs as entry (entry.id)}
							<tr>
								<td class="whitespace-nowrap">{formatDate(entry.createdAt)}</td>
								<td>
									<span class={`badge ${actionBadgeClass(entry.action)} font-mono text-[11px]`}
										>{entry.action}</span
									>
								</td>
								<td class="text-xs">{auditActorLabel(entry)}</td>
								<td class="font-mono text-xs">
									<div>{entry.payload?.request?.method ?? 'N/A'}</div>
									<div class="max-w-56 truncate opacity-70">
										{entry.payload?.request?.path ?? '-'}
									</div>
								</td>
								<td>
									<span class={`badge ${statusBadgeClass(entry.payload?.request?.status)}`}>
										{entry.payload?.request?.status ?? '-'}
									</span>
								</td>
								<td class="text-xs">
									{entry.payload?.resource?.type ?? entry.resourceType ?? '-'}
									{#if entry.resourceId}
										<div
											class="max-w-56 font-mono text-[11px] break-all whitespace-normal opacity-70"
										>
											{entry.resourceId}
										</div>
									{/if}
									{#if entry.payload?.resource?.id && entry.payload?.resource?.id !== entry.resourceId}
										<div
											class="max-w-56 font-mono text-[11px] break-all whitespace-normal opacity-70"
										>
											{entry.payload.resource.id}
										</div>
									{/if}
								</td>
								<td>
									<button
										class="btn btn-outline btn-xs"
										type="button"
										onclick={() => openAuditDetails(entry)}
									>
										<Icon icon="mdi:file-search-outline" class="h-3 w-3" />
										View
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="flex flex-wrap items-center justify-between gap-3">
				<div class="text-sm text-base-content/70">
					Page {auditPagination.page} of {auditPagination.totalPages}
				</div>
				<div class="join">
					<a
						class="btn join-item btn-sm"
						href={toAuditPageHref(Math.max(1, auditPagination.page - 1))}
						aria-disabled={!auditPagination.hasPrev}
					>
						Previous
					</a>
					<a
						class="btn join-item btn-sm"
						href={toAuditPageHref(Math.min(auditPagination.totalPages, auditPagination.page + 1))}
						aria-disabled={!auditPagination.hasNext}
					>
						Next
					</a>
				</div>
			</div>
		{/if}
	</div>
</section>

<dialog bind:this={auditDetailDialog} class="modal" onclose={closeAuditDetails}>
	<div class="modal-box max-h-[90vh] w-11/12 max-w-6xl overflow-hidden p-0">
		{#if auditDetailEntry}
			<div class="border-b border-base-300 bg-base-200/60 px-6 py-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div class="text-xs tracking-wide uppercase opacity-60">Audit event</div>
						<div class="mt-1 flex flex-wrap items-center gap-2">
							<span
								class={`badge ${actionBadgeClass(auditDetailEntry.action)} font-mono text-[11px]`}
								>{auditDetailEntry.action}</span
							>
							<span class="text-sm opacity-70">{formatDate(auditDetailEntry.createdAt)}</span>
						</div>
					</div>
					<form method="dialog">
						<button class="btn btn-ghost btn-sm" type="submit">
							<Icon icon="mdi:close" class="h-4 w-4" />
						</button>
					</form>
				</div>
			</div>

			<div class="grid max-h-[75vh] gap-4 overflow-auto p-6 lg:grid-cols-2">
				<div class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
					<h3 class="text-sm font-semibold tracking-wide uppercase opacity-70">Request</h3>
					<div class="grid gap-2 text-sm">
						<div>
							<span class="opacity-60">ID:</span>
							<span class="font-mono text-xs">{auditDetailEntry.payload?.request?.id ?? '-'}</span>
						</div>
						<div>
							<span class="opacity-60">Method:</span>
							<span class="font-mono text-xs"
								>{auditDetailEntry.payload?.request?.method ?? '-'}</span
							>
						</div>
						<div>
							<span class="opacity-60">Path:</span>
							<span class="font-mono text-xs">{auditDetailEntry.payload?.request?.path ?? '-'}</span
							>
						</div>
						<div>
							<span class="opacity-60">IP:</span>
							<span class="font-mono text-xs"
								>{auditDetailEntry.payload?.request?.ipAddress ?? '-'}</span
							>
						</div>
						<div>
							<span class="opacity-60">Duration:</span>
							<span class="font-mono text-xs"
								>{auditDetailEntry.payload?.request?.durationMs ?? '-'} ms</span
							>
						</div>
					</div>
					<div>
						<div class="mb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">
							Request body
						</div>
						<pre
							class="max-h-64 overflow-auto rounded-lg border border-base-300 bg-base-200/60 p-3 font-mono text-[11px] leading-relaxed">{toPrettyJson(
								auditDetailEntry.payload?.request?.body
							) || 'No request body captured.'}</pre>
					</div>
				</div>

				<div class="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
					<h3 class="text-sm font-semibold tracking-wide uppercase opacity-70">Response</h3>
					<div class="grid gap-2 text-sm">
						<div>
							<span class="opacity-60">Status:</span>
							<span
								class={`ml-2 badge ${statusBadgeClass(auditDetailEntry.payload?.request?.status)}`}
							>
								{auditDetailEntry.payload?.request?.status ?? '-'}
							</span>
						</div>
						<div>
							<span class="opacity-60">Resource type:</span>
							<span class="font-mono text-xs"
								>{auditDetailEntry.payload?.resource?.type ??
									auditDetailEntry.resourceType ??
									'-'}</span
							>
						</div>
						<div>
							<span class="opacity-60">Resource ID:</span>
							<span class="font-mono text-xs break-all whitespace-normal"
								>{auditDetailEntry.payload?.resource?.id ??
									auditDetailEntry.resourceId ??
									'-'}</span
							>
						</div>
						<div>
							<span class="opacity-60">Actor:</span>
							<span class="font-mono text-xs">{auditDetailEntry.actorId ?? 'anonymous/system'}</span
							>
						</div>
					</div>
					<div>
						<div class="mb-1 text-[11px] font-semibold tracking-wide uppercase opacity-60">
							Response body
						</div>
						<pre
							class="max-h-64 overflow-auto rounded-lg border border-base-300 bg-base-200/60 p-3 font-mono text-[11px] leading-relaxed">{toPrettyJson(
								auditDetailEntry.payload?.response?.body
							) || 'No response body captured (e.g. HTML or empty body).'}</pre>
					</div>
				</div>
			</div>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button type="submit">close</button>
	</form>
</dialog>
