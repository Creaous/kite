<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';
	import { authClient } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages';

	let { data } = $props();
	type SocialProviderId =
		| 'apple'
		| 'discord'
		| 'facebook'
		| 'github'
		| 'gitlab'
		| 'google'
		| 'microsoft';

	let email = $state('');
	let password = $state('');
	let errorMessage = $state('');
	let isSubmitting = $state(false);
	let socialSubmitting = $state<SocialProviderId | null>(null);
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

	async function signIn() {
		errorMessage = '';
		isSubmitting = true;

		try {
			const result = await authClient.signIn.email({
				email,
				password,
				rememberMe: true
			});

			if (result.error) {
				errorMessage = result.error.message ?? m.auth_unable_sign_in();
				return;
			}

			await goto(resolve(getNextPath()));
		} catch {
			errorMessage = m.auth_unable_sign_in();
		} finally {
			isSubmitting = false;
		}
	}

	function getEnabledSocialProviders(): SocialProviderId[] {
		const configured = data?.authSettings?.enabledSocialProviders;
		if (!Array.isArray(configured)) return [];

		return configured.filter(
			(provider: unknown): provider is SocialProviderId => typeof provider === 'string'
		);
	}

	function socialProviderLabel(provider: SocialProviderId) {
		switch (provider) {
			case 'apple':
				return m.auth_provider_apple();
			case 'discord':
				return m.auth_provider_discord();
			case 'facebook':
				return m.auth_provider_facebook();
			case 'github':
				return m.auth_provider_github();
			case 'gitlab':
				return m.auth_provider_gitlab();
			case 'google':
				return m.auth_provider_google();
			case 'microsoft':
				return m.auth_provider_microsoft();
		}
	}

	async function signInSocial(provider: SocialProviderId) {
		errorMessage = '';
		socialSubmitting = provider;

		try {
			const result = await authClient.signIn.social({
				provider,
				callbackURL: getNextPath(),
				requestSignUp: Boolean(data?.authSettings?.registrationEnabled)
			});

			if (result.error) {
				errorMessage = result.error.message ?? m.auth_unable_social_sign_in();
				return;
			}
		} catch {
			errorMessage = m.auth_unable_social_sign_in();
		} finally {
			socialSubmitting = null;
		}
	}
</script>

<svelte:head>
	<title>{m.auth_sign_in()} | {data.branding?.appName || m.app_name()}</title>
</svelte:head>

<section class="mx-auto max-w-md">
	<div class="card border border-base-300 bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<div>
				<h1 class="text-2xl font-bold">{m.auth_sign_in()}</h1>
				<p class="text-sm text-base-content/70">{m.auth_sign_in_subtitle()}</p>
			</div>

			{#if page.url.searchParams.get('registrationDisabled') === '1'}
				<div role="alert" class="alert alert-info">
					<span>{m.auth_registration_disabled()}</span>
				</div>
			{/if}

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
					autocomplete="current-password"
				/>
			</fieldset>

			<button class="btn btn-primary" type="button" onclick={signIn} disabled={isSubmitting}>
				<Icon icon="mdi:login" class="h-4 w-4" />
				{isSubmitting ? m.auth_signing_in() : m.auth_sign_in()}
			</button>

			{#if getEnabledSocialProviders().length > 0}
				<div class="divider my-0">{m.auth_or_continue_with()}</div>
				<div class="grid gap-2">
					{#each getEnabledSocialProviders() as provider (provider)}
						<button
							class="btn btn-outline"
							type="button"
							onclick={() => signInSocial(provider)}
							disabled={socialSubmitting !== null}
						>
							<Icon icon="mdi:account-circle-outline" class="h-4 w-4" />
							{socialSubmitting === provider
								? m.auth_signing_in()
								: m.auth_continue_with_provider({ provider: socialProviderLabel(provider) })}
						</button>
					{/each}
				</div>
			{/if}

			{#if errorMessage}
				<div role="alert" class="alert alert-error"><span>{errorMessage}</span></div>
			{/if}

			{#if data.authSettings?.registrationEnabled}
				<p class="text-sm text-base-content/70">
					{m.auth_no_account()}
					<a class="link link-primary" href={resolve('/sign-up')}>
						{m.auth_create_one()}
					</a>
				</p>
			{/if}
		</div>
	</div>
</section>
