<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import Icon from '@iconify/svelte';
	import ToastViewport from '$lib/components/ToastViewport.svelte';
	import { createToastState } from '$lib/components/toast/toast-state.svelte';
	import { m } from '$lib/paraglide/messages';
	import { onDestroy } from 'svelte';

	let { data } = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	const toastState = createToastState();
	let isSubmitting = $state(false);

	onDestroy(() => {
		toastState.destroy();
	});
</script>

<svelte:head>
	<title>{m.auth_sign_up()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<ToastViewport toasts={toastState.toasts} onDismiss={toastState.dismiss} />

<section class="mx-auto max-w-md">
	<div class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<div>
				<h1 class="text-2xl font-bold">{m.auth_sign_up()}</h1>
				<p class="text-sm text-base-content/70">{m.auth_sign_up_subtitle()}</p>
			</div>

			<form
				method="POST"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ result, update }) => {
						await update();
						if (result.type === 'failure') {
							const actionError =
								typeof (result.data as { errorMessage?: unknown } | undefined)?.errorMessage ===
								'string'
									? (result.data as { errorMessage?: string }).errorMessage
									: null;
							toastState.push('error', actionError ?? m.auth_unable_sign_up());
						}
						isSubmitting = false;
					};
				}}
			>
				<input type="hidden" name="next" value={data.next ?? '/'} />
				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_name()}</legend>
					<input
						class="input-bordered input w-full"
						type="text"
						name="name"
						bind:value={name}
						autocomplete="name"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_email()}</legend>
					<input
						class="input-bordered input w-full"
						type="email"
						name="email"
						bind:value={email}
						autocomplete="email"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">{m.form_password()}</legend>
					<input
						class="input-bordered input w-full"
						type="password"
						name="password"
						bind:value={password}
						autocomplete="new-password"
					/>
				</fieldset>

				<button class="btn btn-primary" type="submit" disabled={isSubmitting}>
					<Icon icon="mdi:account-plus-outline" class="h-4 w-4" />
					{isSubmitting ? m.auth_creating_account() : m.auth_create_account()}
				</button>
			</form>

			<p class="text-sm text-base-content/70">
				{m.auth_has_account()}
				<a class="link link-primary" href={resolve('/sign-in')}>
					{m.auth_sign_in()}
				</a>
			</p>
		</div>
	</div>
</section>
