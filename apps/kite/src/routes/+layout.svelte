<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import Icon from '@iconify/svelte';
	import { onMount } from 'svelte';
	import { authClient } from '$lib/auth-client';
	import { m } from '$lib/paraglide/messages';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import './layout.css';
	import defaultFavicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
	let signingOut = $state(false);
	let stoppingImpersonation = $state(false);
	let onboardingDismissed = $state(false);
	const ONBOARDING_DIALOG_ID = 'onboarding-dialog';

	const isImpersonating = $derived(
		Boolean((data.session as { impersonatedBy?: string } | null)?.impersonatedBy)
	);
	const appName = $derived(data.branding?.appName?.trim() || m.app_name());
	const appTagline = $derived(data.branding?.tagline?.trim() || '');
	const logoUrl = $derived(data.branding?.logoUrl?.trim() || '');
	const faviconUrl = $derived(data.branding?.faviconUrl?.trim() || defaultFavicon);
	const metaDescription = $derived(appTagline || appName);
	const robotsContent = $derived(
		data.branding?.disableIndexing ? 'noindex, nofollow' : 'index, follow'
	);
	const shouldShowOnboarding = $derived(
		Boolean(data.user && !data.userProfile?.onboardingCompleted && !onboardingDismissed)
	);

	type NavItem = {
		href: '/' | '/shares' | '/share-requests' | '/admin';
		label: () => string;
		icon: string;
		adminOnly?: boolean;
	};

	const navItems: NavItem[] = [
		{ href: '/', label: () => m.nav_create_share(), icon: 'mdi:plus-circle-outline' },
		{ href: '/shares', label: () => m.nav_shares(), icon: 'mdi:link-variant' },
		{
			href: '/share-requests',
			label: () => m.nav_share_requests(),
			icon: 'mdi:file-document-multiple-outline'
		},
		{
			href: '/admin',
			label: () => m.admin_title(),
			icon: 'mdi:shield-account-outline',
			adminOnly: true
		}
	];

	async function signOut() {
		signingOut = true;
		try {
			await authClient.signOut();
			await goto(resolve('/sign-in'));
		} finally {
			signingOut = false;
		}
	}

	async function stopImpersonating() {
		stoppingImpersonation = true;
		try {
			const result = await authClient.admin.stopImpersonating();
			if (result.error) return;
			await goto(resolve('/admin'));
		} finally {
			stoppingImpersonation = false;
		}
	}

	function getDialog(id: string) {
		const dialog = document.getElementById(id);
		return dialog instanceof HTMLDialogElement ? dialog : null;
	}

	async function markOnboardingComplete() {
		if (!data.user || data.userProfile?.onboardingCompleted || onboardingDismissed) return;

		onboardingDismissed = true;

		await fetch('/api/v1/me/onboarding', {
			method: 'POST'
		});
	}

	function dismissOnboarding() {
		const dialog = getDialog(ONBOARDING_DIALOG_ID);
		if (dialog?.open) {
			dialog.close();
		}
	}

	async function handleOnboardingClose() {
		await markOnboardingComplete();
	}

	async function completeOnboardingAndDismiss() {
		await markOnboardingComplete();
		dismissOnboarding();
	}

	async function openShareRequestsFromOnboarding(event: MouseEvent) {
		event.preventDefault();
		await markOnboardingComplete();
		await goto(resolve('/share-requests'));
	}

	onMount(() => {
		if (!shouldShowOnboarding) return;

		getDialog(ONBOARDING_DIALOG_ID)?.showModal();
	});
</script>

<svelte:head>
	<link rel="icon" href={faviconUrl} />
	<meta name="application-name" content={appName} />
	<meta name="description" content={metaDescription} />
	<meta property="og:site_name" content={appName} />
	<meta property="og:description" content={metaDescription} />
	<meta name="robots" content={robotsContent} />
</svelte:head>

<div class="min-h-screen bg-base-200">
	<header class="navbar border-b border-base-300 bg-base-100 px-4 shadow-sm">
		<div class="flex-1">
			<a href={resolve('/')} class="btn text-lg btn-ghost">
				{#if logoUrl}
					<img src={logoUrl} alt={appName} class="h-5 w-5 rounded-sm object-cover" />
				{:else}
					<Icon icon="mdi:kite" class="h-5 w-5" />
				{/if}
				<span>{appName}</span>
			</a>
		</div>
		<nav class="mr-2 flex-none">
			<ul class="menu menu-horizontal gap-1 px-1">
				{#each navItems as item (item.href)}
					{#if !item.adminOnly || data.user?.role === 'admin'}
						<li>
							<a
								href={resolve(item.href)}
								class={page.url.pathname === item.href ? 'active' : ''}
								data-sveltekit-preload-data
							>
								<Icon icon={item.icon} class="h-4 w-4" />
								{item.label()}
							</a>
						</li>
					{/if}
				{/each}
			</ul>
		</nav>
		<div class="flex items-center gap-2">
			{#if isImpersonating}
				<button
					class="btn btn-sm btn-warning"
					type="button"
					onclick={stopImpersonating}
					disabled={stoppingImpersonation}
				>
					<Icon icon="mdi:account-arrow-left-outline" class="h-4 w-4" />
					{stoppingImpersonation
						? m.auth_stop_impersonating_loading()
						: m.auth_stop_impersonating()}
				</button>
			{/if}
			{#if data.user}
				<span class="hidden text-sm text-base-content/70 sm:inline">{data.user.email}</span>
				<button class="btn btn-sm" type="button" onclick={signOut} disabled={signingOut}>
					<Icon icon="mdi:logout" class="h-4 w-4" />
					{signingOut ? m.auth_signing_out() : m.auth_sign_out()}
				</button>
			{:else}
				<a class="btn btn-ghost btn-sm" href={resolve('/sign-in')}>
					<Icon icon="mdi:login" class="h-4 w-4" />
					{m.auth_sign_in()}
				</a>
			{/if}
		</div>
	</header>

	<main class="mx-auto w-full max-w-6xl p-4 md:p-6">{@render children()}</main>
</div>

{#if shouldShowOnboarding}
	<dialog id={ONBOARDING_DIALOG_ID} class="modal" onclose={handleOnboardingClose}>
		<div class="modal-box max-w-2xl">
			<h2 class="text-xl font-semibold">Welcome to {appName}</h2>
			<p class="mt-2 text-sm text-base-content/70">
				Here is a quick walkthrough to start sharing in under a minute.
			</p>
			<ol class="mt-4 list-inside list-decimal space-y-2 text-sm">
				<li>
					Create a share with files or text from the <span class="font-medium">Create Share</span> page.
				</li>
				<li>Set expiry, password protection, and download limits before publishing.</li>
				<li>
					Use <span class="font-medium">Share Requests</span> when you need others to upload files to
					you.
				</li>
			</ol>
			<div class="modal-action">
				<a
					class="btn btn-outline"
					href={resolve('/share-requests')}
					onclick={openShareRequestsFromOnboarding}>Open Share Requests</a
				>
				<button class="btn btn-primary" type="button" onclick={completeOnboardingAndDismiss}
					>Start Sharing</button
				>
			</div>
		</div>
	</dialog>
{/if}

<div style="display:none">
	{#each locales as locale (locale)}
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a href={localizeHref(page.url.pathname, { locale })}>
			{locale}
		</a>
	{/each}
</div>
