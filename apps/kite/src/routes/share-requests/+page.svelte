<script lang="ts">
	import { resolve } from '$app/paths';
	import Icon from '@iconify/svelte';
	import { m } from '$lib/paraglide/messages';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';

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

	let activeTab = $state<'create' | 'manage'>('create');

	let errorMessage = $derived(data.errorMessage ?? '');
	let successMessage = $state('');

	let actionId = $state('');
	let requestCode = $state('');

	let title = $state('');
	let message = $state('');
	let requesterName = $state('');
	let requesterEmail = $state('');
	let hideRequesterEmail = $state(false);
	let expiresAt = $state('');

	let canCreateRequests = $derived(data.canCreateShareRequest);
	let loadingRequests = $state(false);
	let shareRequests = $derived<ShareRequestItem[]>(data.shareRequests);

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
	const canEmailRequests = $derived(data.smtpConfigured);

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

	function openEditModal(request: ShareRequestItem) {
		actionId = request.id ?? '';
		editTitle = request.title ?? '';
		editMessage = request.message ?? '';
		editRequesterName = request.requesterName ?? '';
		editRequesterEmail = request.requesterEmail ?? '';
		editHideRequesterEmail = Boolean(request.hideRequesterEmail);
		editExpiresAt = request.expiresAt ? new Date(request.expiresAt).toISOString().slice(0, 16) : '';
		getDialog(EDIT_DIALOG_ID)?.showModal();
	}

	function openDeleteModal(request: ShareRequestItem) {
		actionId = request.id ?? '';
		getDialog(DELETE_DIALOG_ID)?.showModal();
	}

	function openEmailModal(id: string, code: string = '') {
		requestCode = code;
		actionId = id;
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

	function copyRequestLink(code: string) {
		const url = `${window.location.origin}/r/${code}`;
		void navigator.clipboard.writeText(url);
		successMessage = m.request_link_copied();
	}

	onMount(() => {
		requesterName = getDefaultRequesterName();
		requesterEmail = getDefaultRequesterEmail();
		hideRequesterEmail = false;
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

{#if errorMessage}
	<div role="alert" class="mb-4 alert alert-error"><span>{errorMessage}</span></div>
{/if}
{#if successMessage}
	<div role="alert" class="mb-4 alert alert-success"><span>{successMessage}</span></div>
{/if}

<div class="tabs-boxed mb-4 tabs w-fit">
	<button
		class="tab"
		class:tab-active={activeTab === 'create'}
		disabled={!canCreateRequests}
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
</div>

{#if activeTab === 'create'}
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			<form
				method="POST"
				action="?/create"
				use:enhance={() => {
					if (!canCreateRequests) {
						errorMessage = m.request_create_permission_denied();
						return;
					}

					if (!title.trim()) {
						errorMessage = m.form_title_required();
						return;
					}

					return async ({ result }) => {
						if (result.type === 'success' && result.data?.success) {
							const data = result.data?.data as ShareRequestItem;
							successMessage = m.request_created_code({ code: data.code });
							shareRequests.unshift(data);
							requestCode = data.code;
							// clear
							title = '';
							message = '';
							requesterName = getDefaultRequesterName();
							requesterEmail = getDefaultRequesterEmail();
							hideRequesterEmail = false;
							expiresAt = '';
						}

						if ('data' in result) {
							const error = result.data?.errorMessage;
							errorMessage = error ?? m.request_create_failed();
						}
					};
				}}
			>
				<h2 class="card-title">{m.request_create_title()}</h2>
				{#if !canCreateRequests}
					<div role="alert" class="alert alert-warning">
						<span>{m.request_create_permission_denied()}</span>
					</div>
				{/if}
				<div class="grid gap-4 sm:grid-cols-2">
					<fieldset class="fieldset sm:col-span-2">
						<legend class="fieldset-legend">{m.form_title()}</legend>
						<input
							class="input-bordered input w-full"
							name="title"
							bind:value={title}
							type="text"
							disabled={!canCreateRequests}
						/>
					</fieldset>
					<fieldset class="fieldset sm:col-span-2">
						<legend class="fieldset-legend">{m.common_message()}</legend>
						<textarea
							class="textarea-bordered textarea w-full"
							name="message"
							bind:value={message}
							disabled={!canCreateRequests}
						></textarea>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">{m.request_requester_name()}</legend>
						<input
							class="input-bordered input w-full"
							name="requesterName"
							bind:value={requesterName}
							type="text"
							disabled={!canCreateRequests}
						/>
					</fieldset>
					<fieldset class="fieldset">
						<legend class="fieldset-legend">{m.request_requester_email()}</legend>
						<input
							class="input-bordered input w-full"
							name="requesterEmail"
							bind:value={requesterEmail}
							type="email"
							disabled={!canCreateRequests}
						/>
						<label class="label cursor-pointer justify-start gap-2">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								name="hideRequesterEmail"
								bind:checked={hideRequesterEmail}
								disabled={!canCreateRequests}
							/>
							<span class="label-text">{m.request_hide_requester_email()}</span>
						</label>
					</fieldset>
					<fieldset class="fieldset sm:col-span-2">
						<legend class="fieldset-legend">{m.request_expires_optional()}</legend>
						<input
							class="input-bordered input w-full"
							name="expiresAt"
							bind:value={expiresAt}
							type="datetime-local"
							disabled={!canCreateRequests}
						/>
					</fieldset>
				</div>
				<div class="card-actions">
					<button class="btn btn-primary" type="submit" disabled={!canCreateRequests}
						>{m.request_create_action()}</button
					>
				</div>
				{#if requestCode}
					<a class="flex link items-center gap-1 link-primary" href={resolve(`/r/${requestCode}`)}>
						<Icon icon="mdi:open-in-new" class="h-4 w-4" />
						{m.request_open_public_page()}
					</a>
				{/if}
			</form>
		</div>
	</section>
{:else if activeTab === 'manage'}
	<section class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body">
			{#if loadingRequests}
				<span class="loading loading-md loading-spinner"></span>
			{:else if shareRequests.length === 0}
				<p>{m.request_empty_open()}</p>
			{:else}
				<div class="grid gap-4 md:grid-cols-2">
					{#each shareRequests as request (request.id)}
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
											onclick={() => openEmailModal(request.id, request.code)}
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
{/if}

<dialog id={EDIT_DIALOG_ID} class="modal">
	<div class="modal-box">
		<form
			method="POST"
			action="?/edit"
			use:enhance={({ formData }) => {
				formData.set('id', actionId);
				// to-do: figure out why calling update() removes the id but not the others
				return async ({ result }) => {
					if (result.type === 'success' && result.data?.success) {
						successMessage = m.request_update_success();
						shareRequests = shareRequests.map((shareRequest) =>
							shareRequest.id === actionId ? (result.data?.data as ShareRequestItem) : shareRequest
						);
					}

					if ('data' in result) {
						const error = result.data?.errorMessage;
						if (!error) getDialog(EDIT_DIALOG_ID)?.close();
						errorMessage = error ?? m.request_update_failed();
					}
				};
			}}
		>
			<h3 class="text-lg font-semibold">{m.request_edit_title()}</h3>
			<div class="mt-3 space-y-3">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_title()}</legend>
					<input
						class="input-bordered input w-full"
						name="title"
						bind:value={editTitle}
						type="text"
					/>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.common_message()}</legend>
					<textarea
						class="textarea-bordered textarea w-full"
						name="message"
						bind:value={editMessage}
					></textarea>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.request_requester_name()}</legend>
					<input
						class="input-bordered input w-full"
						name="requesterName"
						bind:value={editRequesterName}
						type="text"
					/>
				</fieldset>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.request_requester_email()}</legend>
					<input
						class="input-bordered input w-full"
						name="requesterEmail"
						bind:value={editRequesterEmail}
						type="email"
					/>
				</fieldset>
				<label class="label cursor-pointer justify-start gap-2">
					<input
						type="checkbox"
						class="checkbox checkbox-sm"
						name="hideRequesterEmail"
						bind:checked={editHideRequesterEmail}
					/>
					<span class="label-text">{m.request_hide_requester_email()}</span>
				</label>
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_expires_at()}</legend>
					<input
						class="input-bordered input w-full"
						name="expiresAt"
						bind:value={editExpiresAt}
						type="datetime-local"
					/>
				</fieldset>
			</div>
			<div class="modal-action">
				<button class="btn btn-primary" type="submit">{m.action_save()}</button>
				<button
					class="btn"
					type="button"
					onclick={() => {
						getDialog(EDIT_DIALOG_ID)?.close();
					}}>{m.action_cancel()}</button
				>
			</div>
		</form>
	</div>
</dialog>

<dialog id={DELETE_DIALOG_ID} class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-semibold">{m.request_delete_confirm_title()}</h3>
		<p class="py-2 text-sm">{m.common_cannot_undo()}</p>
		<div class="modal-action">
			<form
				method="POST"
				action="?/delete"
				use:enhance={({ formData }) => {
					formData.set('id', actionId);
					return async ({ result }) => {
						if (result.type === 'success' && result.data?.success) {
							successMessage = m.request_delete_success();
							shareRequests = shareRequests.filter((shareRequest) => shareRequest.id !== actionId);
						}

						if ('data' in result) {
							const error = result.data?.errorMessage;
							if (!error) getDialog(DELETE_DIALOG_ID)?.close();
							errorMessage = error ?? m.request_delete_failed();
						}
					};
				}}
			>
				<button class="btn btn-error" type="submit">{m.action_delete()}</button>
			</form>
			<button
				class="btn"
				type="button"
				onclick={() => {
					getDialog(DELETE_DIALOG_ID)?.close();
				}}>{m.action_cancel()}</button
			>
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
					<span class="font-mono">/r/{requestCode}</span>
				</p>
			</div>
			<div class="modal-action">
				<form
					method="POST"
					action="?/email"
					use:enhance={({ formData }) => {
						const recipients = getRecipientsForSend();
						if (recipients.length === 0) {
							errorMessage = m.request_email_recipient_required();
							return;
						}

						formData.set('id', actionId);
						formData.set('recipients', JSON.stringify(recipients));

						// to-do: figure out why calling update() removes the id but not the others
						return async ({ result }) => {
							if (result.type === 'success' && result.data?.success) {
								successMessage = m.request_email_sent_count({ count: recipients.length });
							}

							if ('data' in result) {
								const error = result.data?.errorMessage;
								if (!error) getDialog(EMAIL_DIALOG_ID)?.close();
								errorMessage = error ?? m.request_email_send_failed();
							}
						};
					}}
				>
					<button class="btn btn-primary" type="submit">{m.request_email_send_action()}</button>
				</form>
				<button
					class="btn"
					type="button"
					onclick={() => {
						getDialog(EMAIL_DIALOG_ID)?.close();
					}}>{m.request_email_not_now()}</button
				>
			</div>
		</div>
	</dialog>
{/if}
