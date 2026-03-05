<script lang="ts">
	import Icon from '@iconify/svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	import UnifiedUploadInterface, {
		type UploadedFile
	} from '$lib/components/upload/UnifiedUploadInterface.svelte';
	import { m } from '$lib/paraglide/messages';

	let { data, params } = $props<{
		data: {
			branding?: { appName?: string };
			alertSettings?: {
				shareFlowAlert?: {
					enabled?: boolean;
					message?: string;
					type?: 'info' | 'success' | 'warning' | 'error';
				};
			};
			requestData: ShareRequest | null;
			errorMessage?: string;
			notFound?: boolean;
			allowAnonymousUsers?: boolean;
			hasSubmissionSession?: boolean;
		};
		params: { code: string };
	}>();

	type ShareRequest = {
		id: string;
		code: string;
		title: string | null;
		message: string | null;
		requesterName: string | null;
		requesterEmail: string | null;
		status: string;
		expiresAt: string | null;
	};

	const shareFlowAlert = $derived(data.alertSettings?.shareFlowAlert ?? null);
	function getInitialRequestData() {
		return data.requestData ?? null;
	}

	function getInitialErrorMessage() {
		return data.errorMessage ?? '';
	}

	function getInitialHasSubmissionSession() {
		return Boolean(data.hasSubmissionSession);
	}

	let requestData = $state<ShareRequest | null>(getInitialRequestData());
	let uploads = $state<UploadedFile[]>([]);
	let responding = $state(false);
	let message = $state(getInitialErrorMessage());
	let hasSubmissionSession = $state(getInitialHasSubmissionSession());

	const uploadsPayload = $derived(
		JSON.stringify(uploads.map((upload) => ({ uploadId: upload.uploadId })))
	);
</script>

<svelte:head>
	<title
		>{m.request_page_title({ code: params.code })} | {data.branding?.appName || m.app_name()}</title
	>
</svelte:head>

<main class="space-y-6">
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<h1 class="text-2xl font-bold">{m.public_request_title()}</h1>
			<p class="text-sm text-base-content/70">
				{m.request_code()}: <span class="font-mono">{params.code}</span>
			</p>
		</div>
	</section>

	{#if requestData}
		<section class="card border border-base-300 bg-base-100 shadow-sm">
			<div class="card-body">
				<h2 class="card-title">
					{requestData.title || m.request_untitled()}
				</h2>
				{#if requestData.message}
					<p>{requestData.message}</p>
				{/if}
				<div class="mt-2">
					<span class="badge badge-outline">{m.common_status()}: {requestData.status}</span>
				</div>
				{#if requestData.requesterName || requestData.requesterEmail}
					<p class="text-sm text-base-content/70">
						{m.request_requested_by()}
						{requestData.requesterName || m.common_unknown()}
						{requestData.requesterEmail ? ` <${requestData.requesterEmail}>` : ''}
					</p>
				{/if}
			</div>
		</section>

		{#if requestData.status === 'open'}
			{#if shareFlowAlert?.enabled && shareFlowAlert.message?.trim()}
				<div role="alert" class={`alert alert-${shareFlowAlert.type ?? 'info'}`}>
					<span>{shareFlowAlert.message}</span>
				</div>
			{/if}

			{#if !hasSubmissionSession && !data.allowAnonymousUsers}
				<div role="alert" class="alert alert-warning">
					<span>{m.auth_sign_in_required_response()}</span>
				</div>
			{/if}

			<form
				method="POST"
				action="?/respond"
				class="space-y-6"
				use:enhance={() => {
					if (uploads.length === 0) {
						message = m.upload_at_least_one();
						return;
					}

					responding = true;
					message = '';
					return async ({ result, update }) => {
						await update();
						if (result.type === 'failure') {
							message = result.data?.errorMessage ?? m.request_respond_failed();
						}

						if (result.type === 'success' && result.data?.success) {
							hasSubmissionSession = true;
							const shareId =
								(result.data?.data as { shareId?: string } | undefined)?.shareId ?? '';
							message = m.request_response_submitted({ shareId });
							uploads = [];
							await invalidateAll();
						}

						responding = false;
					};
				}}
			>
				<input type="hidden" name="uploads" value={uploadsPayload} />

				<UnifiedUploadInterface
					title={m.request_upload_to_respond()}
					onuploaded={(files) => (uploads = files)}
				/>

				<section class="card border border-base-300 bg-base-100 shadow-sm">
					<div class="card-body">
						<button
							class="btn btn-primary"
							disabled={responding || uploads.length === 0}
							type="submit"
						>
							<Icon icon="mdi:reply-outline" class="h-4 w-4" />
							{responding ? m.request_submitting() : m.request_submit_response()}
						</button>
					</div>
				</section>
			</form>
		{/if}
	{:else if data.notFound}
		<div role="alert" class="alert alert-error"><span>{m.request_not_found()}</span></div>
	{:else}
		<div role="alert" class="alert alert-warning"><span>{m.request_load_failed()}</span></div>
	{/if}

	{#if message}
		<div role="alert" class="alert alert-info"><span>{message}</span></div>
	{/if}
</main>
