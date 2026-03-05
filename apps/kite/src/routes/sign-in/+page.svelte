<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';
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

			<form
				method="POST"
				action="?/email"
				use:enhance={() => {
					errorMessage = '';
					isSubmitting = true;
					return async ({ result, update }) => {
						await update();
						if (result.type === 'failure') {
							const actionError = (result.data as { errorMessage?: string } | undefined)
								?.errorMessage;
							errorMessage = actionError ?? m.auth_unable_sign_in();
						}
						isSubmitting = false;
					};
				}}
			>
				<input type="hidden" name="next" value={data.next} />
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
						autocomplete="current-password"
					/>
				</fieldset>

				<button class="btn btn-primary" type="submit" disabled={isSubmitting}>
					<Icon icon="mdi:login" class="h-4 w-4" />
					{isSubmitting ? m.auth_signing_in() : m.auth_sign_in()}
				</button>
			</form>

			{#if getEnabledSocialProviders().length > 0}
				<div class="divider my-0">{m.auth_or_continue_with()}</div>
				<div class="grid gap-2">
					{#each getEnabledSocialProviders() as provider (provider)}
						<form
							method="POST"
							action="?/social"
							use:enhance={({ formData }) => {
								errorMessage = '';
								socialSubmitting = (formData.get('provider') as SocialProviderId) ?? null;
								return async ({ result, update }) => {
									await update();
									if (result.type === 'failure') {
										const actionError = (result.data as { errorMessage?: string } | undefined)
											?.errorMessage;
										errorMessage = actionError ?? m.auth_unable_social_sign_in();
									}
									socialSubmitting = null;
								};
							}}
						>
							<input type="hidden" name="provider" value={provider} />
							<input type="hidden" name="next" value={data.next} />
							<input
								type="hidden"
								name="requestSignUp"
								value={data.authSettings?.registrationEnabled ? 'true' : 'false'}
							/>
							<button
								class="btn w-full btn-outline"
								type="submit"
								disabled={socialSubmitting !== null}
							>
								<Icon icon="mdi:account-circle-outline" class="h-4 w-4" />
								{socialSubmitting === provider
									? m.auth_signing_in()
									: m.auth_continue_with_provider({ provider: socialProviderLabel(provider) })}
							</button>
						</form>
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
