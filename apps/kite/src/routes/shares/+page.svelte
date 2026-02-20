<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '@iconify/svelte';
	import { m } from '$lib/paraglide/messages';
	import { onMount } from 'svelte';

	let { data } = $props();

	type ShareListItem = {
		id: string;
		code: string;
		title: string | null;
		message: string | null;
		hideMessageBehindPassword: boolean;
		expiresAt: string | null;
		passwordProtected: boolean;
		maxDownloads: number;
		downloadCount: number;
		viewCount: number;
		uploadCount: number;
		createdAt: string;
	};

	let shares = $state<ShareListItem[]>([]);
	let loading = $state(true);
	let errorMessage = $state('');
	let successMessage = $state('');
	const EDIT_DIALOG_ID = 'share-edit-dialog';
	const DELETE_DIALOG_ID = 'share-delete-dialog';
	let selectedShare = $state<ShareListItem | null>(null);
	let editTitle = $state('');
	let editMessage = $state('');
	let editHideMessageBehindPassword = $state(false);
	let editMaxDownloads = $state(0);
	let editExpiresAt = $state('');
	let editPassword = $state('');

	function getDialog(id: string) {
		const dialog = document.getElementById(id);
		return dialog instanceof HTMLDialogElement ? dialog : null;
	}

	function toLocalDateTimeInput(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return '';
		const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
		return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
	}

	function toIsoDateTime(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toISOString();
	}

	async function loadShares() {
		loading = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/v1/shares');
			const body = await response.json();
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.share_load_failed();
				shares = [];
				return;
			}

			shares = body.data;
		} catch {
			errorMessage = m.share_load_failed();
			shares = [];
		} finally {
			loading = false;
		}
	}

	function openEditModal(share: ShareListItem) {
		selectedShare = share;
		editTitle = share.title ?? '';
		editMessage = share.message ?? '';
		editHideMessageBehindPassword = share.hideMessageBehindPassword;
		editMaxDownloads = share.maxDownloads ?? 0;
		editExpiresAt = share.expiresAt ? toLocalDateTimeInput(share.expiresAt) : '';
		editPassword = '';
		getDialog(EDIT_DIALOG_ID)?.showModal();
	}

	function openDeleteModal(share: ShareListItem) {
		selectedShare = share;
		getDialog(DELETE_DIALOG_ID)?.showModal();
	}

	async function saveShare() {
		if (!selectedShare) return;

		errorMessage = '';
		successMessage = '';

		const response = await fetch(`/api/v1/shares/${selectedShare.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: editTitle || null,
				message: editMessage || null,
				hideMessageBehindPassword: editHideMessageBehindPassword,
				maxDownloads: editMaxDownloads,
				expiresAt: editExpiresAt ? toIsoDateTime(editExpiresAt) : null,
				password: editPassword || undefined
			})
		});

		const body = await response.json();
		if (!response.ok) {
			errorMessage = body?.error?.message ?? m.share_update_failed();
			return;
		}

		successMessage = m.share_update_success();
		getDialog(EDIT_DIALOG_ID)?.close();
		await loadShares();
	}

	async function deleteShare() {
		if (!selectedShare) return;

		errorMessage = '';
		successMessage = '';

		const response = await fetch(`/api/v1/shares/${selectedShare.id}`, { method: 'DELETE' });
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			errorMessage = body?.error?.message ?? m.share_delete_failed();
			return;
		}

		successMessage = m.share_delete_success();
		getDialog(DELETE_DIALOG_ID)?.close();
		await loadShares();
	}

	function copyShareLink(code: string) {
		const url = `${window.location.origin}/s/${code}`;
		void navigator.clipboard.writeText(url);
		successMessage = m.share_link_copied();
	}

	function formatDate(value: string | null) {
		if (!value) return m.common_never();
		return new Date(value).toLocaleString();
	}

	onMount(() => {
		void loadShares();
	});
</script>

<svelte:head>
	<title>{m.page_title_shares()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mb-6">
	<h1 class="text-2xl font-bold">{m.nav_shares()}</h1>
	<p class="text-sm text-base-content/70">{m.shares_subtitle()}</p>
</section>

{#if errorMessage}
	<div role="alert" class="mb-4 alert alert-error"><span>{errorMessage}</span></div>
{/if}
{#if successMessage}
	<div role="alert" class="mb-4 alert alert-success"><span>{successMessage}</span></div>
{/if}

{#if loading}
	<div class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body"><span class="loading loading-md loading-spinner"></span></div>
	</div>
{:else if shares.length === 0}
	<div class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<p>{m.shares_empty()}</p>
			<a class="flex link items-center gap-1 link-primary" href={resolve('/')}>
				<Icon icon="mdi:plus-circle-outline" class="h-4 w-4" />
				{m.shares_create_first()}
			</a>
		</div>
	</div>
{:else}
	<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each shares as share (share.id)}
			<article class="card border border-base-300 bg-base-100 shadow-sm">
				<div class="card-body gap-3">
					<div class="flex items-start justify-between gap-2">
						<h2 class="card-title text-base">{share.title || m.share_untitled()}</h2>
						{#if share.passwordProtected}
							<span class="badge badge-outline badge-warning">{m.share_protected_badge()}</span>
						{/if}
					</div>

					<div class="text-sm text-base-content/80">
						<p>{m.common_code()}: <span class="font-mono">{share.code}</span></p>
						<p>{m.common_files()}: {share.uploadCount}</p>
						{#if share.message}
							<p class="line-clamp-2">{m.common_message()}: {share.message}</p>
						{/if}
						<p>{m.common_views()}: {share.viewCount}</p>
						<p>{m.common_downloads()}: {share.downloadCount}</p>
						<p>
							{m.common_limit()}: {share.maxDownloads > 0
								? share.maxDownloads
								: m.common_unlimited()}
						</p>
						<p>{m.common_expires()}: {formatDate(share.expiresAt)}</p>
					</div>

					<div class="card-actions justify-end">
						<a class="btn btn-outline btn-sm" href={resolve(`/s/${share.code}`)} target="_blank">
							<Icon icon="mdi:open-in-new" class="h-4 w-4" />
							{m.action_open()}
						</a>
						<button
							class="btn btn-ghost btn-sm"
							onclick={() => copyShareLink(share.code)}
							type="button"
						>
							<Icon icon="mdi:content-copy" class="h-4 w-4" />
							{m.action_copy()}
						</button>
						<button class="btn btn-ghost btn-sm" onclick={() => openEditModal(share)} type="button">
							<Icon icon="mdi:pencil-outline" class="h-4 w-4" />
							{m.action_edit()}
						</button>
						<button
							class="btn text-error btn-ghost btn-sm"
							onclick={() => openDeleteModal(share)}
							type="button"
						>
							<Icon icon="mdi:delete-outline" class="h-4 w-4" />
							{m.action_delete()}
						</button>
					</div>
				</div>
			</article>
		{/each}
	</div>
{/if}

<dialog id={EDIT_DIALOG_ID} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.share_edit_title()}</h3>
		<div class="mt-3 space-y-3">
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_title()}</legend>
				<input class="input-bordered input w-full" bind:value={editTitle} type="text" />
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_expires_at()}</legend>
				<input
					class="input-bordered input w-full"
					bind:value={editExpiresAt}
					type="datetime-local"
				/>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.share_max_downloads()}</legend>
				<input
					class="input-bordered input w-full"
					bind:value={editMaxDownloads}
					type="number"
					min="0"
				/>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.common_message()}</legend>
				<textarea class="textarea-bordered textarea w-full" bind:value={editMessage}></textarea>
			</fieldset>
			<fieldset class="fieldset sm:col-span-2">
				<legend class="fieldset-legend">{m.share_message_visibility()}</legend>
				<label class="label cursor-pointer justify-start gap-3">
					<input class="toggle" type="checkbox" bind:checked={editHideMessageBehindPassword} />
					<span class="label-text">{m.share_hide_message_password()}</span>
				</label>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.share_new_password_optional()}</legend>
				<input
					class="input-bordered input w-full"
					bind:value={editPassword}
					type="text"
					placeholder={m.share_new_password_placeholder()}
				/>
			</fieldset>
		</div>
		<div class="modal-action">
			<button class="btn btn-primary" onclick={saveShare} type="button">{m.action_save()}</button>
			<form method="dialog"><button class="btn">{m.action_cancel()}</button></form>
		</div>
	</div>
</dialog>

<dialog id={DELETE_DIALOG_ID} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.share_delete_confirm_title()}</h3>
		<p class="py-3 text-sm">{m.common_cannot_undo()}</p>
		<div class="modal-action">
			<button class="btn btn-error" onclick={deleteShare} type="button">{m.action_delete()}</button>
			<form method="dialog"><button class="btn">{m.action_cancel()}</button></form>
		</div>
	</div>
</dialog>
