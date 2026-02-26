<script lang="ts">
	import Icon from '@iconify/svelte';
	import { m } from '$lib/paraglide/messages';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import FileTreeView from './FileTreeView.svelte';
	import type { FileTreeEntry } from './file-tree';
	import { normalizeRelativePath } from './file-tree';

	export type UploadedFile = {
		uploadId: string;
		filename: string;
		relativePath: string;
		size: number;
		status: string;
	};

	type PendingUploadEntry = {
		key: string;
		file: File;
		relativePath: string;
	};

	type UploadProgressStatus = 'pending' | 'uploading' | 'ready' | 'error';

	type UploadStateByKey = {
		uploadId?: string;
		deduplicated?: boolean;
	};

	let {
		title = m.upload_title_default(),
		onuploaded,
		highSensitivity = false
	}: {
		title?: string;
		onuploaded?: (files: UploadedFile[]) => void;
		highSensitivity?: boolean;
	} = $props();

	let selectedEntries = $state<PendingUploadEntry[]>([]);
	let uploadedFiles = $state<UploadedFile[]>([]);
	let expandedNodes = $state<Record<string, boolean>>({});
	let isUploading = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let folderTargetPath = $state('');
	let uploadProgressByKey = $state<Record<string, number>>({});
	let uploadStatusByKey = $state<Record<string, UploadProgressStatus>>({});
	let uploadStateByKey = $state<Record<string, UploadStateByKey>>({});

	const activeAbortControllers = new SvelteMap<string, AbortController>();
	const MAX_RETRIES_PER_FILE = 2;
	const RETRY_DELAY_MS = 600;

	function onFileChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (!target.files) return;
		addInputFiles(target.files, false);
		target.value = '';
	}

	function onFolderChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (!target.files) return;
		addInputFiles(target.files, true);
		target.value = '';
	}

	function onFolderChildChange(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		if (!target.files) return;
		addFilesToExistingFolder(target.files, folderTargetPath);
		target.value = '';
	}

	function addInputFiles(files: FileList, preserveFolderPath: boolean) {
		const next = Array.from(files).map((file) => {
			const inputPath = preserveFolderPath ? file.webkitRelativePath || file.name : file.name;
			const relativePath = normalizeRelativePath(inputPath);
			return {
				key: `${relativePath}-${file.size}-${file.lastModified}`,
				file,
				relativePath
			} satisfies PendingUploadEntry;
		});

		const byKey: Record<string, PendingUploadEntry> = {};
		for (const item of selectedEntries) byKey[item.key] = item;
		for (const item of next) byKey[item.key] = item;
		selectedEntries = Object.values(byKey);
		errorMessage = '';
		successMessage = '';
	}

	function addFilesToExistingFolder(files: FileList, folderPath: string) {
		const normalizedFolder = normalizeRelativePath(folderPath);
		const next = Array.from(files).map((file) => {
			const relativePath = normalizeRelativePath(`${normalizedFolder}/${file.name}`);
			return {
				key: `${relativePath}-${file.size}-${file.lastModified}`,
				file,
				relativePath
			} satisfies PendingUploadEntry;
		});

		const byKey: Record<string, PendingUploadEntry> = {};
		for (const item of selectedEntries) byKey[item.key] = item;
		for (const item of next) byKey[item.key] = item;
		selectedEntries = Object.values(byKey);
	}

	function isAbortError(value: unknown) {
		return value instanceof DOMException && value.name === 'AbortError';
	}

	function sleep(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function cancelUploadIfNeeded(entry: PendingUploadEntry) {
		const state = uploadStateByKey[entry.key];
		if (!state?.uploadId || state.deduplicated) return;

		try {
			await fetch(`/api/v1/uploads/${state.uploadId}/status`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'cancel' })
			});
		} catch {
			// best effort cleanup
		}

		uploadStateByKey = {
			...uploadStateByKey,
			[entry.key]: {
				uploadId: undefined,
				deduplicated: false
			}
		};
	}

	function removeFile(path: string) {
		const normalized = normalizeRelativePath(path);
		const toRemove = selectedEntries.filter((entry) => entry.relativePath === normalized);
		for (const entry of toRemove) {
			activeAbortControllers.get(entry.key)?.abort();
			void cancelUploadIfNeeded(entry);
		}

		selectedEntries = selectedEntries.filter((entry) => entry.relativePath !== normalized);
		uploadedFiles = uploadedFiles.filter((entry) => entry.relativePath !== normalized);

		const nextProgressByKey = { ...uploadProgressByKey };
		const nextStatusByKey = { ...uploadStatusByKey };
		for (const entry of toRemove) {
			activeAbortControllers.delete(entry.key);
			delete nextProgressByKey[entry.key];
			delete nextStatusByKey[entry.key];
		}
		uploadProgressByKey = nextProgressByKey;
		uploadStatusByKey = nextStatusByKey;
		emit();
	}

	function removeFolder(path: string) {
		const normalized = normalizeRelativePath(path);
		const prefix = `${normalized}/`;
		const toRemove = selectedEntries.filter((entry) => entry.relativePath.startsWith(prefix));
		for (const entry of toRemove) {
			activeAbortControllers.get(entry.key)?.abort();
			void cancelUploadIfNeeded(entry);
		}

		selectedEntries = selectedEntries.filter((entry) => !entry.relativePath.startsWith(prefix));
		uploadedFiles = uploadedFiles.filter((entry) => !entry.relativePath.startsWith(prefix));

		const nextProgressByKey = { ...uploadProgressByKey };
		const nextStatusByKey = { ...uploadStatusByKey };
		for (const entry of toRemove) {
			activeAbortControllers.delete(entry.key);
			delete nextProgressByKey[entry.key];
			delete nextStatusByKey[entry.key];
		}
		uploadProgressByKey = nextProgressByKey;
		uploadStatusByKey = nextStatusByKey;
		emit();
	}

	function openFolderChildPicker(path: string) {
		folderTargetPath = path;
		const input = document.getElementById('upload-folder-child-input') as HTMLInputElement | null;
		input?.click();
	}

	function toggleExpanded(path: string) {
		expandedNodes = { ...expandedNodes, [path]: !(expandedNodes[path] ?? true) };
	}

	function emit() {
		onuploaded?.(uploadedFiles);
	}

	function uploadChunkWithProgress(
		uploadId: string,
		data: ArrayBuffer,
		onProgress: (percent: number) => void,
		signal?: AbortSignal
	) {
		return new Promise<void>((resolve, reject) => {
			const request = new XMLHttpRequest();
			request.open('PATCH', `/api/v1/uploads/${uploadId}`);
			request.responseType = 'json';
			request.withCredentials = true;
			request.setRequestHeader('content-type', 'application/octet-stream');

			request.upload.onprogress = (event) => {
				if (!event.lengthComputable) return;
				const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
				onProgress(percent);
			};

			request.onerror = () => {
				reject(new Error(m.upload_chunk_network_error()));
			};

			request.onabort = () => {
				reject(new DOMException('Upload aborted', 'AbortError'));
			};

			const onAbort = () => {
				request.abort();
			};

			if (signal) {
				if (signal.aborted) {
					onAbort();
					return;
				}
				signal.addEventListener('abort', onAbort, { once: true });
			}

			request.onload = () => {
				if (request.status >= 200 && request.status < 300) {
					onProgress(100);
					resolve();
					return;
				}

				const maybeError =
					typeof request.response === 'object' && request.response !== null
						? (request.response as { error?: { message?: string } })
						: undefined;
				reject(new Error(maybeError?.error?.message ?? m.upload_chunk_failed()));
			};

			request.onloadend = () => {
				if (signal) {
					signal.removeEventListener('abort', onAbort);
				}
			};

			request.send(data);
		});
	}

	async function uploadEntry(entry: PendingUploadEntry) {
		const { file, relativePath } = entry;
		const fingerprint = `${relativePath}-${file.size}-${file.lastModified}`;
		const controller = new AbortController();
		activeAbortControllers.set(entry.key, controller);

		const initResponse = await fetch('/api/v1/uploads', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			signal: controller.signal,
			body: JSON.stringify({
				filename: file.name,
				relativePath,
				size: file.size,
				fingerprint,
				chunkSize: file.size,
				highSensitivity
			})
		});

		const initBody = await initResponse.json();
		if (!initResponse.ok) {
			throw new Error(initBody?.error?.message ?? m.upload_init_failed({ file: file.name }));
		}

		const uploadId = String(initBody.data.uploadId);
		const deduplicated = Boolean(initBody?.data?.deduplicated);
		const initialStatus = String(initBody?.data?.status ?? 'pending');
		uploadStateByKey = {
			...uploadStateByKey,
			[entry.key]: {
				uploadId,
				deduplicated
			}
		};

		if (!deduplicated || initialStatus !== 'ready') {
			const buffer = await file.arrayBuffer();

			await uploadChunkWithProgress(
				uploadId,
				buffer,
				(percent) => {
					uploadProgressByKey = { ...uploadProgressByKey, [entry.key]: percent };
				},
				controller.signal
			);

			const finalizeResponse = await fetch(`/api/v1/uploads/${uploadId}/status`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				signal: controller.signal,
				body: JSON.stringify({ action: 'finalize' })
			});
			const finalizeBody = await finalizeResponse.json();
			if (!finalizeResponse.ok) {
				throw new Error(
					finalizeBody?.error?.message ?? m.upload_finalize_failed({ file: file.name })
				);
			}

			return {
				uploadId,
				filename: file.name,
				relativePath,
				size: file.size,
				status: String(finalizeBody?.data?.status ?? 'ready')
			} satisfies UploadedFile;
		}

		return {
			uploadId,
			filename: file.name,
			relativePath,
			size: file.size,
			status: 'ready'
		} satisfies UploadedFile;
	}

	async function uploadEntryWithRetries(entry: PendingUploadEntry) {
		let lastError: unknown = null;

		for (let attempt = 0; attempt <= MAX_RETRIES_PER_FILE; attempt++) {
			try {
				return await uploadEntry(entry);
			} catch (err) {
				lastError = err;
				if (isAbortError(err)) {
					throw err;
				}

				if (attempt < MAX_RETRIES_PER_FILE) {
					await cancelUploadIfNeeded(entry);
					uploadProgressByKey = { ...uploadProgressByKey, [entry.key]: 0 };
					await sleep(RETRY_DELAY_MS * (attempt + 1));
					continue;
				}

				throw err;
			} finally {
				activeAbortControllers.delete(entry.key);
			}
		}

		throw lastError instanceof Error ? lastError : new Error(m.upload_failed());
	}

	async function uploadEntries(entriesToUpload: PendingUploadEntry[]) {
		if (entriesToUpload.length === 0) return;

		for (const entry of entriesToUpload) {
			uploadProgressByKey = { ...uploadProgressByKey, [entry.key]: 0 };
			uploadStatusByKey = { ...uploadStatusByKey, [entry.key]: 'pending' };
		}

		isUploading = true;
		errorMessage = '';
		successMessage = '';

		const successful: UploadedFile[] = [];
		const failedKeys = new SvelteSet<string>();
		let firstErrorMessage = '';

		for (const entry of entriesToUpload) {
			uploadStatusByKey = { ...uploadStatusByKey, [entry.key]: 'uploading' };

			try {
				const uploaded = await uploadEntryWithRetries(entry);
				uploadProgressByKey = { ...uploadProgressByKey, [entry.key]: 100 };
				uploadStatusByKey = { ...uploadStatusByKey, [entry.key]: 'ready' };
				successful.push(uploaded);
			} catch (err) {
				if (isAbortError(err) && !selectedEntries.some((item) => item.key === entry.key)) {
					continue;
				}

				failedKeys.add(entry.key);
				uploadStatusByKey = { ...uploadStatusByKey, [entry.key]: 'error' };
				if (!firstErrorMessage) {
					firstErrorMessage = err instanceof Error ? err.message : m.upload_failed();
				}
			}
		}

		if (successful.length > 0) {
			const uploadedById = new SvelteMap(uploadedFiles.map((item) => [item.uploadId, item]));
			for (const item of successful) {
				uploadedById.set(item.uploadId, item);
			}
			uploadedFiles = Array.from(uploadedById.values());
			emit();
			successMessage = m.upload_success_count({ count: successful.length });
		}

		if (firstErrorMessage) {
			errorMessage = firstErrorMessage;
		}

		if (failedKeys.size > 0) {
			selectedEntries = selectedEntries.filter(
				(entry) =>
					failedKeys.has(entry.key) ||
					!entriesToUpload.some((candidate) => candidate.key === entry.key)
			);
		} else {
			selectedEntries = selectedEntries.filter(
				(entry) => !entriesToUpload.some((candidate) => candidate.key === entry.key)
			);
		}

		isUploading = false;
	}

	async function uploadAll() {
		await uploadEntries([...selectedEntries]);
	}

	async function retryFile(entry: FileTreeEntry) {
		if (isUploading || entry.status !== 'error') return;
		const targetPath = normalizeRelativePath(entry.relativePath);
		const target = selectedEntries.find((item) => item.relativePath === targetPath);
		if (!target) return;
		await uploadEntries([target]);
	}

	const pendingTreeEntries = $derived(
		selectedEntries.map((entry) => ({
			id: `pending:${entry.key}`,
			name: entry.file.name,
			relativePath: entry.relativePath,
			size: entry.file.size,
			status: uploadStatusByKey[entry.key] ?? 'pending',
			progress: uploadProgressByKey[entry.key] ?? 0
		})) satisfies FileTreeEntry[]
	);

	const uploadedTreeEntries = $derived(
		uploadedFiles.map((entry) => ({
			id: `uploaded:${entry.uploadId}`,
			name: entry.filename,
			relativePath: entry.relativePath,
			size: entry.size,
			status: entry.status,
			progress: 100,
			uploadId: entry.uploadId
		})) satisfies FileTreeEntry[]
	);

	const combinedTreeEntries = $derived([...pendingTreeEntries, ...uploadedTreeEntries]);
</script>

<section class="card border border-base-300 bg-base-100 shadow-sm">
	<div class="card-body gap-4">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-base-content">{title}</h2>
			{#if isUploading}
				<span class="loading loading-sm loading-spinner" aria-label={m.upload_uploading_aria()}
				></span>
			{/if}
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				class="btn btn-outline"
				type="button"
				onclick={() => {
					const input = document.getElementById('upload-file-input') as HTMLInputElement | null;
					input?.click();
				}}
			>
				<Icon icon="mdi:file-upload-outline" class="h-4 w-4" />
				{m.upload_files_action()}
			</button>
			<button
				class="btn btn-outline"
				type="button"
				onclick={() => {
					const input = document.getElementById('upload-folder-input') as HTMLInputElement | null;
					input?.click();
				}}
			>
				<Icon icon="mdi:folder-upload-outline" class="h-4 w-4" />
				{m.upload_folder_action()}
			</button>
			<input id="upload-file-input" class="hidden" multiple onchange={onFileChange} type="file" />
			<input
				id="upload-folder-input"
				class="hidden"
				multiple
				onchange={onFolderChange}
				type="file"
				webkitdirectory
			/>
			<input
				id="upload-folder-child-input"
				class="hidden"
				multiple
				onchange={onFolderChildChange}
				type="file"
			/>
		</div>

		<FileTreeView
			entries={combinedTreeEntries}
			{expandedNodes}
			onToggleExpanded={toggleExpanded}
			onRetryFile={(entry) => {
				void retryFile(entry);
			}}
			onAddFilesToFolder={openFolderChildPicker}
			onRemoveFile={(entry) => removeFile(entry.relativePath)}
			onRemoveFolder={removeFolder}
		/>

		<div class="card-actions justify-start">
			<button
				class="btn btn-primary"
				disabled={selectedEntries.length === 0 || isUploading}
				onclick={uploadAll}
				type="button"
			>
				<Icon icon="mdi:upload" class="h-4 w-4" />
				{m.upload_files_action()}
			</button>
		</div>

		{#if errorMessage}
			<div role="alert" class="alert alert-error">
				<span>{errorMessage}</span>
			</div>
		{/if}
		{#if successMessage}
			<div role="alert" class="alert alert-success">
				<span>{successMessage}</span>
			</div>
		{/if}
	</div>
</section>
