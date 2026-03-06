<script lang="ts">
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

	let { data } = $props();

	let errorMessage = $state('');
	let successMessage = $state('');

	let users = $derived<AdminUser[]>(data.users ?? []);
	let total = $derived<number>(data.total ?? 0);

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

	let maintenanceQueues = $derived<MaintenanceQueueStatus[]>(data.maintenanceData?.queues ?? []);
	let maintenanceRefreshedAt = $derived<string | null>(data.maintenanceData?.refreshedAt ?? null);

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

	type EnhanceResult = {
		result: { type: string; data?: { errorMessage?: string; successMessage?: string } };
		update: () => Promise<void>;
	};

	function handleActionResult(defaultError: string, defaultSuccess: string) {
		return async ({ result, update }: EnhanceResult) => {
			await update();
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

{#if errorMessage || data.loadErrors?.users || data.loadErrors?.branding || data.loadErrors?.authSettings || data.loadErrors?.alertSettings || data.loadErrors?.maintenance}
	<div role="alert" class="mb-4 alert alert-error">
		<span
			>{errorMessage ||
				data.loadErrors?.users ||
				data.loadErrors?.branding ||
				data.loadErrors?.authSettings ||
				data.loadErrors?.alertSettings ||
				data.loadErrors?.maintenance}</span
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

<section class="card border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<form
			method="GET"
			action={resolve('/admin')}
			class="flex flex-wrap items-end justify-between gap-3"
		>
			<fieldset class="fieldset w-full max-w-md">
				<legend class="fieldset-legend">{m.admin_search_email()}</legend>
				<div class="join w-full">
					<input
						class="input-bordered input join-item w-full"
						type="search"
						name="search"
						value={data.search ?? ''}
						placeholder={m.admin_search_placeholder()}
					/>
					<button class="btn join-item" type="submit">
						<Icon icon="mdi:magnify" class="h-4 w-4" />
						{m.admin_search_action()}
					</button>
				</div>
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

<section class="card mt-6 border border-base-300 bg-base-100 shadow-sm">
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
