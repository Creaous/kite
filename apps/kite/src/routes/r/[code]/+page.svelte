<script lang="ts">
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';

	import { authClient } from '$lib/auth-client';
	import UnifiedUploadInterface, {
		type UploadedFile
	} from '$lib/components/upload/UnifiedUploadInterface.svelte';
	import { m } from '$lib/paraglide/messages';

	let { data, params } = $props<{
		data: {
			branding?: { appName?: string };
			authSettings?: { anonymousTokensEnabled?: boolean };
		};
		params: { code: string };
	}>();

	const allowAnonymousUsers = $derived(Boolean(data.authSettings?.anonymousTokensEnabled));

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

	let requestData = $state<ShareRequest | null>(null);
	let uploads = $state<UploadedFile[]>([]);
	let loading = $state(true);
	let responding = $state(false);
	let message = $state('');
	let hasSubmissionSession = $state(false);

	async function ensureSubmissionSession() {
		try {
			const sessionResult = await authClient.getSession();
			if (sessionResult.data?.user) {
				hasSubmissionSession = true;
				return;
			}

			if (!allowAnonymousUsers) {
				hasSubmissionSession = false;
				return;
			}

			const tokenResponse = await fetch(
				`/api/v1/public/share-requests/${params.code}/anonymous-token`,
				{ method: 'POST' }
			);
			const tokenBody = await tokenResponse.json();
			if (!tokenResponse.ok || !tokenBody?.data?.token) {
				hasSubmissionSession = false;
				return;
			}

			const result = await authClient.signIn.anonymous({
				fetchOptions: {
					query: {
						token: tokenBody.data.token
					}
				}
			});

			hasSubmissionSession = !result.error;
		} catch {
			hasSubmissionSession = false;
		}
	}

	async function loadRequest() {
		loading = true;
		message = '';
		try {
			const response = await fetch(`/api/v1/public/share-requests/${params.code}`);
			const body = await response.json();
			if (!response.ok) {
				message = body?.error?.message ?? m.request_load_failed();
				requestData = null;
				return;
			}
			requestData = body.data;
		} catch {
			message = m.request_load_failed();
			requestData = null;
		} finally {
			loading = false;
		}
	}

	async function respond() {
		if (!requestData) return;
		if (uploads.length === 0) {
			message = m.upload_at_least_one();
			return;
		}

		if (!hasSubmissionSession) {
			message = m.auth_sign_in_required_response();
			return;
		}

		responding = true;
		message = '';
		try {
			const response = await fetch(`/api/v1/public/share-requests/${params.code}/respond`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ uploads: uploads.map((upload) => ({ uploadId: upload.uploadId })) })
			});
			const body = await response.json();
			if (!response.ok) {
				message = body?.error?.message ?? m.request_respond_failed();
				return;
			}

			message = m.request_response_submitted({ shareId: body.data.shareId });
			await loadRequest();
		} catch {
			message = m.request_respond_failed();
		} finally {
			responding = false;
		}
	}

	onMount(() => {
		void Promise.all([loadRequest(), ensureSubmissionSession()]);
	});
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

	{#if loading}
		<div role="alert" class="alert alert-info"><span>{m.request_loading()}</span></div>
	{:else if requestData}
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
						{requestData.requesterEmail || ''}
					</p>
				{/if}
			</div>
		</section>

		{#if requestData.status === 'open'}
			{#if !hasSubmissionSession}
				<div role="alert" class="alert alert-warning">
					<span>{m.auth_sign_in_required_response()}</span>
				</div>
			{/if}

			<UnifiedUploadInterface
				title={m.request_upload_to_respond()}
				onuploaded={(files) => (uploads = files)}
			/>

			<section class="card border border-base-300 bg-base-100 shadow-sm">
				<div class="card-body">
					<button
						class="btn btn-primary"
						disabled={responding || uploads.length === 0 || !hasSubmissionSession}
						onclick={respond}
						type="button"
					>
						<Icon icon="mdi:reply-outline" class="h-4 w-4" />
						{responding ? m.request_submitting() : m.request_submit_response()}
					</button>
				</div>
			</section>
		{/if}
	{:else}
		<div role="alert" class="alert alert-error"><span>{m.request_not_found()}</span></div>
	{/if}

	{#if message}
		<div role="alert" class="alert alert-info"><span>{message}</span></div>
	{/if}
</main>
