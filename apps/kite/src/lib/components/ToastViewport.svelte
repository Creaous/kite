<script lang="ts">
	import type { ToastItem, ToastType } from '$lib/components/toast/toast-state.svelte';

	let {
		toasts,
		onDismiss
	}: {
		toasts: ToastItem[];
		onDismiss: (id: number) => void;
	} = $props();

	function toastClass(type: ToastType) {
		switch (type) {
			case 'success':
				return 'alert-success';
			case 'warning':
				return 'alert-warning';
			case 'error':
				return 'alert-error';
			default:
				return 'alert-info';
		}
	}
</script>

<div class="pointer-events-none toast toast-end toast-top z-1000 w-full max-w-sm sm:w-auto">
	{#each toasts as toast (toast.id)}
		<div
			class={`alert ${toastClass(toast.type)} pointer-events-auto mb-2 shadow-lg`}
			role="status"
			aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
			aria-atomic="true"
		>
			<span>{toast.message}</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs"
				aria-label="Dismiss notification"
				onclick={() => onDismiss(toast.id)}
			>
				x
			</button>
		</div>
	{/each}
</div>
