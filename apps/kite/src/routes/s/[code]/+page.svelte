<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import FileTreeView from '$lib/components/upload/FileTreeView.svelte';
	import type { FileTreeEntry } from '$lib/components/upload/file-tree';
	import { m } from '$lib/paraglide/messages';

	let { data, params } = $props<{
		data: { branding?: { appName?: string } };
		params: { code: string };
	}>();

	type PublicShare = {
		id: string;
		code: string;
		title: string | null;
		message: string | null;
		hideMessageBehindPassword: boolean;
		expiresAt: string | null;
		maxDownloads: number;
		downloadCount: number;
		viewCount: number;
		requiresPassword: boolean;
		uploads: { id: string; filename: string | null; relativePath: string | null; size: number }[];
	};

	let share = $state<PublicShare | null>(null);
	let password = $state('');
	let loading = $state(true);
	let message = $state('');
	let downloadUrlsByUploadId = $state<Record<string, string>>({});
	let downloadingZip = $state(false);

	const treeEntries = $derived(
		(share?.uploads ?? []).map((file) => ({
			id: file.id,
			name: file.filename || m.upload_unnamed_file(),
			relativePath: file.relativePath || file.filename || file.id,
			size: file.size,
			uploadId: file.id
		})) satisfies FileTreeEntry[]
	);

	async function loadShare() {
		loading = true;
		message = '';
		try {
			const response = password
				? await fetch(`/api/v1/public/shares/${params.code}`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ password })
					})
				: await fetch(`/api/v1/public/shares/${params.code}`);
			const body = await response.json();

			if (!response.ok) {
				if (response.status === 401 && body?.error?.code === 'INVALID_PASSWORD') {
					message = body?.error?.message ?? m.share_load_failed();
					password = '';
					return;
				}

				message = body?.error?.message ?? m.share_load_failed();
				share = null;
				return;
			}

			share = body.data;
		} catch {
			message = m.share_load_failed();
			share = null;
		} finally {
			loading = false;
		}
	}

	async function createDownloadGrant() {
		message = '';
		try {
			const response = await fetch(`/api/v1/public/shares/${params.code}/download`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password: password || undefined })
			});
			const body = await response.json();
			if (!response.ok) {
				message = body?.error?.message ?? m.share_prepare_download_failed();
				return;
			}

			downloadUrlsByUploadId = Object.fromEntries(
				(body.data.downloadUrls as { uploadId: string; url: string }[]).map((item) => [
					item.uploadId,
					item.url
				])
			);
			if (share) {
				share.downloadCount += 1;
			}
		} catch {
			message = m.share_prepare_download_failed();
		}
	}

	async function downloadFile(uploadId: string) {
		if (!downloadUrlsByUploadId[uploadId]) {
			await createDownloadGrant();
		}

		const url = downloadUrlsByUploadId[uploadId];
		if (!url) {
			message = m.share_file_download_failed();
			return;
		}

		downloadUrlsByUploadId = {
			...downloadUrlsByUploadId,
			[uploadId]: ''
		};

		window.location.href = url;
	}

	async function downloadZip() {
		downloadingZip = true;
		message = '';

		try {
			const response = await fetch(`/api/v1/public/shares/${params.code}/download/zip`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password: password || undefined })
			});

			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				message = body?.error?.message ?? m.share_download_zip_failed();
				return;
			}

			const blob = await response.blob();
			const href = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = href;
			a.download = `${params.code}.zip`;
			a.click();
			URL.revokeObjectURL(href);
			if (share) {
				share.downloadCount += 1;
			}
		} catch {
			message = m.share_download_zip_failed();
		} finally {
			downloadingZip = false;
		}
	}

	onMount(() => {
		void loadShare();
	});
</script>

<svelte:head>
	<title
		>{m.page_title_share({ value: share?.title ?? params.code })} | {data.branding?.appName ||
			m.app_name()}</title
	>
</svelte:head>

<main class="space-y-6">
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<h1 class="text-2xl font-bold">{m.public_share_title()}</h1>
			<p class="text-sm text-base-content/70">
				{m.public_access_code()}: <span class="font-mono">{params.code}</span>
			</p>
		</div>
	</section>

	{#if loading}
		<div class="alert alert-info"><span>{m.share_loading()}</span></div>
	{:else if share}
		<section class="card border border-base-300 bg-base-100 shadow-sm">
			<div class="card-body">
				<h2 class="card-title">{share.title || m.share_untitled()}</h2>
				{#if share.expiresAt}
					<p class="text-sm text-base-content/70">
						{m.common_expires()}: {new Date(share.expiresAt).toLocaleString()}
					</p>
				{/if}
				<p class="text-sm text-base-content/70">{m.common_views()}: {share.viewCount}</p>
				<p class="text-sm text-base-content/70">
					{m.common_downloads()}: {share.downloadCount}
					{#if share.maxDownloads > 0}
						/ {share.maxDownloads}
					{/if}
				</p>

				{#if share.message}
					<div class="rounded-box border border-base-300 bg-base-200/50 p-3 text-sm">
						{share.message}
					</div>
				{:else if share.requiresPassword && share.hideMessageBehindPassword}
					<div
						class="rounded-box border border-base-300 bg-base-200/50 p-3 text-sm text-base-content/70"
					>
						{m.public_unlock_message_hint()}
					</div>
				{/if}

				{#if share.requiresPassword}
					<div class="space-y-2">
						<fieldset class="fieldset">
							<legend class="fieldset-legend">{m.public_password_required()}</legend>
							<input class="input-bordered input w-full" bind:value={password} type="password" />
						</fieldset>
						<button class="btn btn-primary" onclick={loadShare} type="button">
							<Icon icon="mdi:lock-open-variant-outline" class="h-4 w-4" />
							{m.public_unlock_share()}
						</button>
					</div>
				{:else}
					{#if share.maxDownloads > 0 && share.downloadCount >= share.maxDownloads}
						<div role="alert" class="alert alert-warning">
							<span>{m.public_download_limit_reached()}</span>
						</div>
					{/if}

					<FileTreeView
						entries={treeEntries}
						readonly={true}
						emptyText={m.public_no_files_in_share()}
						onDownloadFile={(uploadId) => {
							void downloadFile(uploadId);
						}}
					/>

					<div class="mt-4 flex flex-wrap gap-2">
						<button
							class="btn btn-primary"
							onclick={downloadZip}
							type="button"
							disabled={downloadingZip ||
								(share.maxDownloads > 0 && share.downloadCount >= share.maxDownloads)}
						>
							<Icon icon="mdi:folder-zip-outline" class="h-4 w-4" />
							{downloadingZip ? m.public_preparing_zip() : m.public_download_zip()}
						</button>
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<div role="alert" class="alert alert-error"><span>{m.share_not_found()}</span></div>
	{/if}

	{#if message}
		<div role="alert" class="alert alert-warning"><span>{message}</span></div>
	{/if}
</main>
