<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';
	import { authClient } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isSubmitting = $state(false);
	type NextPath =
		| '/'
		| '/admin'
		| '/share-requests'
		| '/shares'
		| '/sign-in'
		| '/sign-up'
		| `/r/${string}`
		| `/s/${string}`;

	function getNextPath(): NextPath {
		const next = page.url.searchParams.get('next');
		if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';

		if (next.startsWith('/r/') || next.startsWith('/s/')) {
			return next as NextPath;
		}

		switch (next) {
			case '/':
			case '/admin':
			case '/share-requests':
			case '/shares':
			case '/sign-in':
			case '/sign-up':
				return next;
			default:
				return '/';
		}
	}

	async function signUp() {
		errorMessage = '';
		isSubmitting = true;

		try {
			const result = await authClient.signUp.email({
				name,
				email,
				password
			});

			if (result.error) {
				errorMessage = result.error.message ?? m.auth_unable_sign_up();
				return;
			}

			await goto(resolve(getNextPath()));
		} catch {
			errorMessage = m.auth_unable_sign_up();
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>{m.auth_sign_up()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mx-auto max-w-md">
	<div class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<div>
				<h1 class="text-2xl font-bold">{m.auth_sign_up()}</h1>
				<p class="text-sm text-base-content/70">{m.auth_sign_up_subtitle()}</p>
			</div>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_name()}</legend>
				<input
					class="input-bordered input w-full"
					type="text"
					bind:value={name}
					autocomplete="name"
				/>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_email()}</legend>
				<input
					class="input-bordered input w-full"
					type="email"
					bind:value={email}
					autocomplete="email"
				/>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">{m.form_password()}</legend>
				<input
					class="input-bordered input w-full"
					type="password"
					bind:value={password}
					autocomplete="new-password"
				/>
			</fieldset>

			<button class="btn btn-primary" type="button" onclick={signUp} disabled={isSubmitting}>
				<Icon icon="mdi:account-plus-outline" class="h-4 w-4" />
				{isSubmitting ? m.auth_creating_account() : m.auth_create_account()}
			</button>

			{#if errorMessage}
				<div role="alert" class="alert alert-error"><span>{errorMessage}</span></div>
			{/if}

			<p class="text-sm text-base-content/70">
				{m.auth_has_account()}
				<a class="link link-primary" href={resolve('/sign-in')}>
					{m.auth_sign_in()}
				</a>
			</p>
		</div>
	</div>
</section>
