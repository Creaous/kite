<script lang="ts">
	import Icon from '@iconify/svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import FileTreeView from '$lib/components/upload/FileTreeView.svelte';
	import type { FileTreeEntry } from '$lib/components/upload/file-tree';
	import { m } from '$lib/paraglide/messages';

	let { data, params } = $props<{
		data: {
			branding?: { appName?: string };
			share: PublicShare | null;
			errorMessage?: string;
			requiresPassword?: boolean;
			notFound?: boolean;
		};
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

	function getInitialShare() {
		return data.share ?? null;
	}

	function getInitialMessage() {
		return data.errorMessage ?? '';
	}

	let share = $state<PublicShare | null>(getInitialShare());
	let password = $state('');
	let message = $state(getInitialMessage());
	let unlocking = $state(false);

	const treeEntries = $derived(
		(share?.uploads ?? []).map((file) => ({
			id: file.id,
			name: file.filename || m.upload_unnamed_file(),
			relativePath: file.relativePath || file.filename || file.id,
			size: file.size,
			uploadId: file.id
		})) satisfies FileTreeEntry[]
	);

	const requiresPassword = $derived(Boolean(data.requiresPassword || share?.requiresPassword));

	function downloadFile(uploadId: string) {
		const query = password ? `?password=${encodeURIComponent(password)}` : '';
		window.location.href = resolve(`/s/${params.code}/download/${uploadId}${query}`);
	}
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

	{#if share}
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

				{#if requiresPassword}
					<form
						method="POST"
						action="?/unlock"
						class="space-y-2"
						use:enhance={() => {
							message = '';
							unlocking = true;
							return async ({ result, update }) => {
								await update();
								if (result.type === 'failure') {
									message = result.data?.errorMessage ?? m.share_load_failed();
								}

								if (result.type === 'success' && result.data?.success) {
									share = result.data?.data as PublicShare;
									if (typeof result.data?.password === 'string') {
										password = result.data.password;
									}
									message = '';
								}

								unlocking = false;
							};
						}}
					>
						<fieldset class="fieldset">
							<legend class="fieldset-legend">{m.public_password_required()}</legend>
							<input
								class="input-bordered input w-full"
								bind:value={password}
								name="password"
								type="password"
							/>
						</fieldset>
						<button class="btn btn-primary" type="submit" disabled={unlocking}>
							<Icon icon="mdi:lock-open-variant-outline" class="h-4 w-4" />
							{unlocking ? m.share_loading() : m.public_unlock_share()}
						</button>
					</form>
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
						<a
							class="btn btn-primary"
							href={resolve(
								`/s/${params.code}/download/zip${password ? `?password=${encodeURIComponent(password)}` : ''}`
							)}
						>
							<Icon icon="mdi:folder-zip-outline" class="h-4 w-4" />
							{m.public_download_zip()}
						</a>
					</div>
				{/if}
			</div>
		</section>
	{:else if data.notFound}
		<div role="alert" class="alert alert-error"><span>{m.share_not_found()}</span></div>
	{:else}
		<form
			method="POST"
			action="?/unlock"
			class="card border border-base-300 bg-base-100 p-4 shadow-sm"
			use:enhance={() => {
				message = '';
				unlocking = true;
				return async ({ result, update }) => {
					await update();
					if (result.type === 'failure') {
						message = result.data?.errorMessage ?? m.share_load_failed();
					}

					if (result.type === 'success' && result.data?.success) {
						share = result.data?.data as PublicShare;
						if (typeof result.data?.password === 'string') {
							password = result.data.password;
						}
						message = '';
					}

					unlocking = false;
				};
			}}
		>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.public_password_required()}</legend>
				<input
					class="input-bordered input w-full"
					bind:value={password}
					name="password"
					type="password"
				/>
			</fieldset>
			<button class="btn btn-primary" type="submit" disabled={unlocking}>
				<Icon icon="mdi:lock-open-variant-outline" class="h-4 w-4" />
				{unlocking ? m.share_loading() : m.public_unlock_share()}
			</button>
		</form>
	{/if}

	{#if message}
		<div role="alert" class="alert alert-warning"><span>{message}</span></div>
	{/if}
</main>
