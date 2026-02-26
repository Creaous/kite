<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '@iconify/svelte';
	import UnifiedUploadInterface, {
		type UploadedFile
	} from '$lib/components/upload/UnifiedUploadInterface.svelte';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();

	let title = $state('');
	let password = $state(generatePassword());
	let expiresAt = $state(defaultExpiryLocalDateTime());
	let message = $state('');
	let hideMessageBehindPassword = $state(false);
	let highSensitivity = $state(false);
	let maxDownloads = $state(0);
	let uploads = $state<UploadedFile[]>([]);
	let isSubmitting = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let createdCode = $state('');
	let generatedPassword = $state('');

	function defaultExpiryLocalDateTime() {
		const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
		const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
		return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
	}

	function generatePassword(length = 14) {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
		const values = new Uint8Array(length);
		crypto.getRandomValues(values);
		return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
	}

	function regeneratePassword() {
		password = generatePassword();
	}

	const totalUploadSize = $derived(
		uploads.reduce((sum, upload) => {
			return sum + upload.size;
		}, 0)
	);

	function formatBytes(size: number) {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	}

	async function createShare() {
		if (uploads.length === 0) {
			errorMessage = m.share_upload_required();
			return;
		}

		isSubmitting = true;
		errorMessage = '';
		successMessage = '';

		try {
			generatedPassword = password || '';
			const response = await fetch('/api/v1/shares', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: title || undefined,
					password: password || undefined,
					message: message || undefined,
					hideMessageBehindPassword,
					highSensitivity,
					maxDownloads,
					expiresAt: expiresAt || undefined,
					uploads: uploads.map((file) => ({ uploadId: file.uploadId, name: file.relativePath }))
				})
			});

			const body = await response.json();
			if (!response.ok) {
				errorMessage = body?.error?.message ?? m.share_create_failed();
				return;
			}

			createdCode = body.data.code;
			successMessage = m.share_create_success();
		} catch {
			errorMessage = m.share_create_failed();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>{m.page_title_create_share()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<div class="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<div>
				<h1 class="text-2xl font-bold">{m.nav_create_share()}</h1>
				<p class="text-sm text-base-content/70">{m.share_create_subtitle()}</p>
			</div>

			<div class="grid gap-4 sm:grid-cols-2">
				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.form_title()}</legend>
					<input class="input-bordered input w-full" bind:value={title} type="text" />
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.share_password_optional()}</legend>
					<div class="join w-full">
						<input
							class="input-bordered input join-item w-full blur-sm transition hover:blur-none focus:blur-none"
							bind:value={password}
							type="text"
						/>
						<button class="btn join-item" type="button" onclick={regeneratePassword}>
							<Icon icon="mdi:refresh" class="h-4 w-4" />
							{m.action_regenerate()}
						</button>
					</div>
					<p class="mt-1 text-xs text-base-content/60">
						{m.share_password_help()}
					</p>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_expires_at()}</legend>
					<input class="input-bordered input w-full" bind:value={expiresAt} type="datetime-local" />
				</fieldset>

				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.share_message_optional()}</legend>
					<textarea class="textarea-bordered textarea w-full" bind:value={message}></textarea>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.share_max_downloads()}</legend>
					<input
						class="input-bordered input w-full"
						bind:value={maxDownloads}
						type="number"
						min="0"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.share_message_visibility()}</legend>
					<label class="label cursor-pointer justify-start gap-3">
						<input class="toggle" type="checkbox" bind:checked={hideMessageBehindPassword} />
						<span class="label-text">{m.share_hide_message_password()}</span>
					</label>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">High sensitivity</legend>
					<label class="label cursor-pointer justify-start gap-3">
						<input class="toggle" type="checkbox" bind:checked={highSensitivity} />
						<span class="label-text">High sensitivity</span>
					</label>
					<p class="mt-1 text-xs text-base-content/60">
						Only applies to newly uploaded or pending files, not older files.
					</p>
				</fieldset>
			</div>

			<UnifiedUploadInterface
				title={m.upload_files_for_share()}
				{highSensitivity}
				onuploaded={(files) => (uploads = files)}
			/>

			<div class="card-actions justify-start">
				<button
					class="btn btn-primary"
					disabled={isSubmitting || uploads.length === 0}
					onclick={createShare}
					type="button"
				>
					<Icon icon="mdi:share-variant" class="h-4 w-4" />
					{isSubmitting ? m.action_creating() : m.share_create_action()}
				</button>
			</div>

			{#if errorMessage}
				<div role="alert" class="alert alert-error"><span>{errorMessage}</span></div>
			{/if}
			{#if successMessage}
				<div role="alert" class="alert alert-success"><span>{successMessage}</span></div>
			{/if}
		</div>
	</section>

	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<h2 class="card-title">
				<Icon icon="mdi:chart-box-outline" class="h-5 w-5" />
				{m.summary_title()}
			</h2>
			<ul class="list rounded-box border border-base-300 bg-base-100">
				<li class="list-row flex justify-between">
					<span>{m.summary_uploaded_files()}</span>
					<span class="badge badge-outline">{uploads.length}</span>
				</li>
				<li class="list-row flex justify-between">
					<span>{m.summary_total_size()}</span>
					<span class="badge badge-outline">{formatBytes(totalUploadSize)}</span>
				</li>
				<li class="list-row flex justify-between">
					<span>{m.summary_password_protected()}</span>
					<span class="badge badge-outline">{password ? m.common_yes() : m.common_no()}</span>
				</li>
				<li class="list-row flex justify-between">
					<span>{m.summary_download_limit()}</span>
					<span class="badge badge-outline">{maxDownloads || m.common_unlimited()}</span>
				</li>
			</ul>

			{#if createdCode}
				<div class="mt-4 space-y-2 rounded-box border border-success/30 bg-success/10 p-3">
					<p class="text-sm font-medium">{m.share_ready()}</p>
					{#if generatedPassword}
						<p class="text-sm">
							{m.form_password()}:
							<span class="font-mono blur-sm hover:blur-none">{generatedPassword}</span>
						</p>
					{/if}
					<a class="flex link items-center gap-1 link-primary" href={resolve(`/s/${createdCode}`)}>
						<Icon icon="mdi:open-in-new" class="h-4 w-4" />
						{m.share_open_public_page()}
					</a>
				</div>
			{/if}
		</div>
	</section>
</div>
