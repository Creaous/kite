<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '@iconify/svelte';
	import { m } from '$lib/paraglide/messages';
	import UnifiedUploadInterface, {
		type UploadedFile
	} from '$lib/components/upload/UnifiedUploadInterface.svelte';
	import { onMount } from 'svelte';
	import { authClient } from '$lib/auth-client';

	let { data } = $props();
	type CurrentUser = {
		name?: string | null;
		email?: string | null;
		username?: string | null;
	};

	type ShareRequestItem = {
		id: string;
		code: string;
		title: string | null;
		message: string | null;
		requesterName: string | null;
		requesterEmail: string | null;
		hideRequesterEmail: boolean;
		expiresAt: string | null;
		status: string;
		createdAt: string;
	};

	let activeTab = $state<'create' | 'manage' | 'respond'>('create');
	let title = $state('');
	let description = $state('');
	let requesterName = $state('');
	let requesterEmail = $state('');
	let hideRequesterEmail = $state(false);
	let expiresAt = $state('');

	let createMessage = $state('');
	let createdCode = $state('');
	let creating = $state(false);
	let canCreateRequests = $state(false);
	let checkingCreatePermission = $state(true);
	let loadingRequests = $state(false);
	let requests = $state<ShareRequestItem[]>([]);
	let selectedRequestId = $state('');
	let selectedRequestCode = $state('');
	const EDIT_DIALOG_ID = 'request-edit-dialog';
	const DELETE_DIALOG_ID = 'request-delete-dialog';
	const EMAIL_DIALOG_ID = 'request-email-dialog';
	let editTitle = $state('');
	let editMessage = $state('');
	let editRequesterName = $state('');
	let editRequesterEmail = $state('');
	let editExpiresAt = $state('');
	let editHideRequesterEmail = $state(false);
	type RecipientDraft = {
		name: string;
		email: string;
	};
	let recipientRows = $state<RecipientDraft[]>([{ name: '', email: '' }]);
	let emailSending = $state(false);
	const canEmailRequests = $derived(Boolean(data.smtpConfigured));

	let respondCode = $state('');
	let responseUploads = $state<UploadedFile[]>([]);
	let responding = $state(false);
	let respondMessage = $state('');

	function getDialog(id: string) {
		const dialog = document.getElementById(id);
		return dialog instanceof HTMLDialogElement ? dialog : null;
	}

	function getDefaultRequesterName() {
		const user = (data.user ?? null) as CurrentUser | null;
		const fromName = user?.name?.trim();
		if (fromName) return fromName;
		const fromUsername = user?.username?.trim();
		if (fromUsername) return fromUsername;
		const fromEmail = user?.email?.trim();
		if (fromEmail && fromEmail.includes('@')) {
			return fromEmail.split('@')[0] || '';
		}
		return '';
	}

	function getDefaultRequesterEmail() {
		const user = (data.user ?? null) as CurrentUser | null;
		return user?.email?.trim() ?? '';
	}

	async function loadRequests() {
		loadingRequests = true;
		try {
			const response = await fetch('/api/v1/share-requests');
			const body = await response.json();
			if (!response.ok) {
				createMessage = body?.error?.message ?? m.request_load_failed();
				requests = [];
				return;
			}

			requests = body.data;
		} catch {
			createMessage = m.request_load_failed();
			requests = [];
		} finally {
			loadingRequests = false;
		}
	}

	async function createRequest() {
		if (!canCreateRequests) {
			createMessage = m.request_create_permission_denied();
			return;
		}

		if (!title.trim()) {
			createMessage = m.form_title_required();
			return;
		}

		creating = true;
		createMessage = '';
		try {
			const response = await fetch('/api/v1/share-requests', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title,
					message: description || undefined,
					expiresAt: expiresAt || undefined,
					requester: {
						name: requesterName || undefined,
						email: requesterEmail || undefined
					},
					hideRequesterEmail
				})
			});

			const body = await response.json();
			if (!response.ok) {
				createMessage = body?.error?.message ?? m.request_create_failed();
				return;
			}

			createdCode = body.data.code;
			respondCode = body.data.code;
			createMessage = m.request_created_code({ code: body.data.code });
			if (canEmailRequests) {
				openEmailModal(body.data as ShareRequestItem);
			}
			title = '';
			description = '';
			requesterName = getDefaultRequesterName();
			requesterEmail = getDefaultRequesterEmail();
			hideRequesterEmail = false;
			expiresAt = '';
			await loadRequests();
		} catch {
			createMessage = m.request_create_failed();
		} finally {
			creating = false;
		}
	}

	async function loadCreatePermission() {
		checkingCreatePermission = true;
		try {
			const result = await authClient.admin.hasPermission({
				permissions: {
					shareRequest: ['create']
				}
			});

			canCreateRequests = Boolean(result.data?.success);

			if (!canCreateRequests && activeTab === 'create') {
				activeTab = 'manage';
			}
		} catch {
			canCreateRequests = false;
			if (activeTab === 'create') {
				activeTab = 'manage';
			}
		} finally {
			checkingCreatePermission = false;
		}
	}

	function openEditModal(request: ShareRequestItem) {
		selectedRequestId = request.id;
		selectedRequestCode = request.code;
		editTitle = request.title ?? '';
		editMessage = request.message ?? '';
		editRequesterName = request.requesterName ?? '';
		editRequesterEmail = request.requesterEmail ?? '';
		editHideRequesterEmail = Boolean(request.hideRequesterEmail);
		editExpiresAt = request.expiresAt ? new Date(request.expiresAt).toISOString().slice(0, 16) : '';
		getDialog(EDIT_DIALOG_ID)?.showModal();
	}

	function openDeleteModal(request: ShareRequestItem) {
		selectedRequestId = request.id;
		selectedRequestCode = request.code;
		getDialog(DELETE_DIALOG_ID)?.showModal();
	}

	function openEmailModal(request: ShareRequestItem) {
		selectedRequestId = request.id;
		selectedRequestCode = request.code;
		recipientRows = [{ name: '', email: '' }];
		getDialog(EMAIL_DIALOG_ID)?.showModal();
	}

	function ensureTrailingRecipientRow() {
		const lastRow = recipientRows[recipientRows.length - 1];
		if (!lastRow || lastRow.name.trim() || lastRow.email.trim()) {
			recipientRows = [...recipientRows, { name: '', email: '' }];
		}
	}

	function updateRecipientField(index: number, field: 'name' | 'email', value: string) {
		recipientRows = recipientRows.map((row, rowIndex) =>
			rowIndex === index ? { ...row, [field]: value } : row
		);
		ensureTrailingRecipientRow();
	}

	function getRecipientsForSend() {
		return recipientRows
			.map((row) => ({
				name: row.name.trim(),
				email: row.email.trim()
			}))
			.filter((row) => row.email)
			.map((row) => ({
				email: row.email,
				...(row.name ? { name: row.name } : {})
			}));
	}

	function openEmailModalFromEdit() {
		if (!selectedRequestId) return;
		const request = requests.find((item) => item.id === selectedRequestId);
		if (!request) return;
		getDialog(EDIT_DIALOG_ID)?.close();
		openEmailModal(request);
	}

	async function sendRequestEmail() {
		if (!selectedRequestId) return;

		const recipients = getRecipientsForSend();
		if (recipients.length === 0) {
			createMessage = m.request_email_recipient_required();
			return;
		}

		emailSending = true;
		try {
			const response = await fetch(`/api/v1/share-requests/${selectedRequestId}/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ recipients })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				createMessage = body?.error?.message ?? m.request_email_send_failed();
				return;
			}

			const count = Array.isArray(body?.data?.accepted)
				? body.data.accepted.length
				: recipients.length;
			createMessage = m.request_email_sent_count({ count });
			getDialog(EMAIL_DIALOG_ID)?.close();
		} catch {
			createMessage = m.request_email_send_failed();
		} finally {
			emailSending = false;
		}
	}

	async function saveRequest() {
		if (!selectedRequestId) return;
		const response = await fetch(`/api/v1/share-requests/${selectedRequestId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: editTitle || null,
				message: editMessage || null,
				requester: {
					name: editRequesterName || null,
					email: editRequesterEmail || null
				},
				hideRequesterEmail: editHideRequesterEmail,
				expiresAt: editExpiresAt || null
			})
		});
		const body = await response.json();
		if (!response.ok) {
			createMessage = body?.error?.message ?? m.request_update_failed();
			return;
		}

		createMessage = m.request_update_success();
		getDialog(EDIT_DIALOG_ID)?.close();
		await loadRequests();
	}

	async function deleteRequest() {
		if (!selectedRequestId) return;
		const response = await fetch(`/api/v1/share-requests/${selectedRequestId}`, {
			method: 'DELETE'
		});
		if (!response.ok) {
			const body = await response.json().catch(() => ({}));
			createMessage = body?.error?.message ?? m.request_delete_failed();
			return;
		}

		createMessage = m.request_delete_success();
		getDialog(DELETE_DIALOG_ID)?.close();
		await loadRequests();
	}

	function copyRequestLink(code: string) {
		const url = `${window.location.origin}/r/${code}`;
		void navigator.clipboard.writeText(url);
		createMessage = m.request_link_copied();
	}

	async function respondToRequest() {
		if (!respondCode.trim()) {
			respondMessage = m.request_code_required();
			return;
		}
		if (responseUploads.length === 0) {
			respondMessage = m.upload_at_least_one();
			return;
		}

		responding = true;
		respondMessage = '';
		try {
			const response = await fetch(`/api/v1/public/share-requests/${respondCode}/respond`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					uploads: responseUploads.map((upload) => ({ uploadId: upload.uploadId }))
				})
			});

			const body = await response.json();
			if (!response.ok) {
				respondMessage = body?.error?.message ?? m.request_respond_failed();
				return;
			}

			respondMessage = m.request_response_created({ shareId: body.data.shareId });
			responseUploads = [];
			await loadRequests();
		} catch {
			respondMessage = m.request_respond_failed();
		} finally {
			responding = false;
		}
	}

	onMount(() => {
		requesterName = getDefaultRequesterName();
		requesterEmail = getDefaultRequesterEmail();
		hideRequesterEmail = false;
		void Promise.all([loadRequests(), loadCreatePermission()]);
	});
</script>

<svelte:head>
	<title>{m.page_title_share_requests()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mb-6">
	<h1 class="text-2xl font-bold">{m.nav_share_requests()}</h1>
	<p class="text-sm text-base-content/70">
		{m.requests_subtitle()}
	</p>
</section>

{#if createMessage}
	<div role="alert" class="mb-4 alert alert-info"><span>{createMessage}</span></div>
{/if}
{#if respondMessage}
	<div role="alert" class="mb-4 alert alert-success"><span>{respondMessage}</span></div>
{/if}

<div class="tabs-boxed mb-4 tabs w-fit">
	<button
		class="tab"
		class:tab-active={activeTab === 'create'}
		disabled={checkingCreatePermission || !canCreateRequests}
		onclick={() => (activeTab = 'create')}
	>
		<Icon icon="mdi:plus-circle-outline" class="h-4 w-4" />
		{m.tab_create()}
	</button>
	<button
		class="tab"
		class:tab-active={activeTab === 'manage'}
		onclick={() => (activeTab = 'manage')}
	>
		<Icon icon="mdi:cog-outline" class="h-4 w-4" />
		{m.tab_manage()}
	</button>
	<button
		class="tab"
		class:tab-active={activeTab === 'respond'}
		onclick={() => (activeTab = 'respond')}
	>
		<Icon icon="mdi:reply-outline" class="h-4 w-4" />
		{m.tab_respond()}
	</button>
</div>

{#if activeTab === 'create'}
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<h2 class="card-title">{m.request_create_title()}</h2>
			{#if checkingCreatePermission}
				<p class="text-sm text-base-content/70">{m.request_checking_permissions()}</p>
			{:else if !canCreateRequests}
				<div role="alert" class="alert alert-warning">
					<span>{m.request_create_permission_denied()}</span>
				</div>
			{/if}
			<div class="grid gap-4 sm:grid-cols-2">
				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.form_title()}</legend>
					<input
						class="input-bordered input w-full"
						bind:value={title}
						type="text"
						disabled={checkingCreatePermission || !canCreateRequests}
					/>
				</fieldset>
				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.common_message()}</legend>
					<textarea
						class="textarea-bordered textarea w-full"
						bind:value={description}
						disabled={checkingCreatePermission || !canCreateRequests}
					></textarea>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.request_requester_name()}</legend>
					<input
						class="input-bordered input w-full"
						bind:value={requesterName}
						type="text"
						disabled={checkingCreatePermission || !canCreateRequests}
					/>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.request_requester_email()}</legend>
					<input
						class="input-bordered input w-full"
						bind:value={requesterEmail}
						type="email"
						disabled={checkingCreatePermission || !canCreateRequests}
					/>
					<label class="label cursor-pointer justify-start gap-2">
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							bind:checked={hideRequesterEmail}
							disabled={checkingCreatePermission || !canCreateRequests}
						/>
						<span class="label-text">{m.request_hide_requester_email()}</span>
					</label>
				</fieldset>
				<fieldset class="fieldset sm:col-span-2">
					<legend class="fieldset-legend">{m.request_expires_optional()}</legend>
					<input
						class="input-bordered input w-full"
						bind:value={expiresAt}
						type="datetime-local"
						disabled={checkingCreatePermission || !canCreateRequests}
					/>
				</fieldset>
			</div>
			<div class="card-actions">
				<button
					class="btn btn-primary"
					disabled={creating || checkingCreatePermission || !canCreateRequests}
					onclick={createRequest}
					type="button"
				>
					<Icon icon="mdi:plus-circle-outline" class="h-4 w-4" />
					{creating ? m.action_creating() : m.request_create_action()}
				</button>
			</div>
			{#if createdCode}
				<a class="flex link items-center gap-1 link-primary" href={resolve(`/r/${createdCode}`)}>
					<Icon icon="mdi:open-in-new" class="h-4 w-4" />
					{m.request_open_public_page()}
				</a>
			{/if}
		</div>
	</section>
{:else if activeTab === 'manage'}
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			{#if loadingRequests}
				<span class="loading loading-md loading-spinner"></span>
			{:else if requests.length === 0}
				<p>{m.request_empty_open()}</p>
			{:else}
				<div class="grid gap-4 md:grid-cols-2">
					{#each requests as request (request.id)}
						<article class="card border border-base-300 bg-base-100">
							<div class="card-body p-4">
								<h3 class="card-title text-base">{request.title || m.request_untitled()}</h3>
								<p class="text-xs text-base-content/70">
									{m.common_code()}: <span class="font-mono">{request.code}</span>
								</p>
								{#if request.message}
									<p class="text-sm text-base-content/80">{request.message}</p>
								{/if}
								<div class="text-xs text-base-content/70">
									<p>{m.common_status()}: {request.status}</p>
									<p>
										{m.common_expires()}: {request.expiresAt
											? new Date(request.expiresAt).toLocaleString()
											: m.common_never()}
									</p>
								</div>
								<div class="card-actions justify-end">
									<a
										class="btn btn-outline btn-sm"
										href={resolve(`/r/${request.code}`)}
										target="_blank"
									>
										<Icon icon="mdi:open-in-new" class="h-4 w-4" />
										{m.action_open()}
									</a>
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => copyRequestLink(request.code)}
										type="button"
									>
										<Icon icon="mdi:content-copy" class="h-4 w-4" />
										{m.action_copy()}
									</button>
									{#if canEmailRequests}
										<button
											class="btn btn-ghost btn-sm"
											onclick={() => openEmailModal(request)}
											type="button"
										>
											<Icon icon="mdi:email-outline" class="h-4 w-4" />
											{m.form_email()}
										</button>
									{/if}
									<button
										class="btn btn-ghost btn-sm"
										onclick={() => openEditModal(request)}
										type="button"
									>
										<Icon icon="mdi:pencil-outline" class="h-4 w-4" />
										{m.action_edit()}
									</button>
									<button
										class="btn text-error btn-ghost btn-sm"
										onclick={() => openDeleteModal(request)}
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
		</div>
	</section>
{:else}
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body space-y-4">
			<h2 class="card-title">{m.request_respond_title()}</h2>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.request_code()}</legend>
				<input class="input-bordered input w-full" bind:value={respondCode} type="text" />
			</fieldset>

			<UnifiedUploadInterface
				title={m.request_upload_response_files()}
				onuploaded={(files) => (responseUploads = files)}
			/>

			<button
				class="btn btn-primary"
				disabled={responding || !respondCode.trim() || responseUploads.length === 0}
				onclick={respondToRequest}
				type="button"
			>
				<Icon icon="mdi:reply-outline" class="h-4 w-4" />
				{responding ? m.request_responding() : m.request_respond_action()}
			</button>
		</div>
	</section>
{/if}

<dialog id={EDIT_DIALOG_ID} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.request_edit_title()}</h3>
		<div class="space-y-3 py-2">
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_title()}</legend>
				<input class="input-bordered input w-full" bind:value={editTitle} type="text" />
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.common_message()}</legend>
				<textarea class="textarea-bordered textarea w-full" bind:value={editMessage}></textarea>
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.request_requester_name()}</legend>
				<input class="input-bordered input w-full" bind:value={editRequesterName} type="text" />
			</fieldset>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.request_requester_email()}</legend>
				<input class="input-bordered input w-full" bind:value={editRequesterEmail} type="email" />
			</fieldset>
			<label class="label cursor-pointer justify-start gap-2">
				<input type="checkbox" class="checkbox checkbox-sm" bind:checked={editHideRequesterEmail} />
				<span class="label-text">{m.request_hide_requester_email()}</span>
			</label>
			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_expires_at()}</legend>
				<input
					class="input-bordered input w-full"
					bind:value={editExpiresAt}
					type="datetime-local"
				/>
			</fieldset>
		</div>
		<div class="modal-action">
			{#if canEmailRequests}
				<button class="btn btn-ghost" onclick={openEmailModalFromEdit} type="button"
					>{m.form_email()}</button
				>
			{/if}
			<button class="btn btn-primary" onclick={saveRequest} type="button">{m.action_save()}</button>
			<form method="dialog"><button class="btn">{m.action_cancel()}</button></form>
		</div>
	</div>
</dialog>

<dialog id={DELETE_DIALOG_ID} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.request_delete_confirm_title()}</h3>
		<p class="py-2 text-sm">{m.common_cannot_undo()}</p>
		<div class="modal-action">
			<button class="btn btn-error" onclick={deleteRequest} type="button"
				>{m.action_delete()}</button
			>
			<form method="dialog"><button class="btn">{m.action_cancel()}</button></form>
		</div>
	</div>
</dialog>

{#if canEmailRequests}
	<dialog id={EMAIL_DIALOG_ID} class="modal">
		<div class="modal-box">
			<h3 class="text-lg font-semibold">{m.request_email_dialog_title()}</h3>
			<p class="py-2 text-sm text-base-content/70">
				{m.request_email_dialog_subtitle()}
			</p>
			<div class="space-y-3">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.request_email_recipients()}</legend>
					<div class="space-y-2">
						{#each recipientRows as recipient, index (index)}
							<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
								<input
									class="input-bordered input w-full"
									type="text"
									placeholder={m.request_email_recipient_name_optional()}
									value={recipient.name}
									oninput={(event) =>
										updateRecipientField(
											index,
											'name',
											(event.currentTarget as HTMLInputElement).value
										)}
								/>
								<input
									class="input-bordered input w-full"
									type="email"
									placeholder={m.request_email_recipient_email_placeholder()}
									value={recipient.email}
									oninput={(event) =>
										updateRecipientField(
											index,
											'email',
											(event.currentTarget as HTMLInputElement).value
										)}
								/>
							</div>
						{/each}
					</div>
				</fieldset>
				<p class="text-xs text-base-content/70">
					<span class="font-mono">/r/{selectedRequestCode}</span>
				</p>
			</div>
			<div class="modal-action">
				<button
					class="btn btn-primary"
					onclick={sendRequestEmail}
					type="button"
					disabled={emailSending}
				>
					<Icon icon="mdi:email-send-outline" class="h-4 w-4" />
					{emailSending ? m.request_email_sending() : m.request_email_send_action()}
				</button>
				<form method="dialog"><button class="btn">{m.request_email_not_now()}</button></form>
			</div>
		</div>
	</dialog>
{/if}
