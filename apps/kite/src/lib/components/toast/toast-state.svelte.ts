export type ToastType = 'info' | 'success' | 'warning' | 'error';

export type ToastItem = {
	id: number;
	type: ToastType;
	message: string;
};

export function createToastState(options?: { durationMs?: number }) {
	let toasts = $state<ToastItem[]>([]);
	let nextToastId = 1;
	let lastLoadErrorToast = '';
	const toastTimers: Record<number, ReturnType<typeof setTimeout>> = {};
	const durationMs = options?.durationMs ?? 6000;

	function dismiss(id: number) {
		const timer = toastTimers[id];
		if (timer) {
			clearTimeout(timer);
			delete toastTimers[id];
		}

		toasts = toasts.filter((toast) => toast.id !== id);
	}

	function push(type: ToastType, message: string) {
		if (!message.trim()) return;

		const id = nextToastId;
		nextToastId += 1;
		toasts = [...toasts, { id, type, message }];

		const timer = setTimeout(() => {
			dismiss(id);
		}, durationMs);

		toastTimers[id] = timer;
	}

	function pushLoadError(message: string | null | undefined) {
		const normalizedMessage = typeof message === 'string' ? message.trim() : '';

		if (normalizedMessage && normalizedMessage !== lastLoadErrorToast) {
			push('error', normalizedMessage);
			lastLoadErrorToast = normalizedMessage;
			return;
		}

		if (!normalizedMessage) {
			lastLoadErrorToast = '';
		}
	}

	function destroy() {
		for (const timer of Object.values(toastTimers)) {
			clearTimeout(timer);
		}

		for (const id of Object.keys(toastTimers)) {
			delete toastTimers[Number(id)];
		}
	}

	return {
		get toasts() {
			return toasts;
		},
		dismiss,
		push,
		pushLoadError,
		destroy
	};
}
