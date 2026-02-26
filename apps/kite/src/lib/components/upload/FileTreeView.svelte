<script lang="ts">
	import Icon from '@iconify/svelte';
	import { m } from '$lib/paraglide/messages';
	import type { FileTreeEntry, FileTreeNode } from './file-tree';
	import { buildFileTree, formatBytes } from './file-tree';

	let {
		entries,
		expandedNodes = {},
		onToggleExpanded,
		onRemoveFile,
		onRemoveFolder,
		onRetryFile,
		onAddFilesToFolder,
		onDownloadFile,
		readonly = false,
		emptyText = m.upload_no_files_selected()
	}: {
		entries: FileTreeEntry[];
		expandedNodes?: Record<string, boolean>;
		onToggleExpanded?: (path: string) => void;
		onRemoveFile?: (entry: FileTreeEntry) => void;
		onRemoveFolder?: (path: string) => void;
		onRetryFile?: (entry: FileTreeEntry) => void;
		onAddFilesToFolder?: (path: string) => void;
		onDownloadFile?: (uploadId: string) => void;
		readonly?: boolean;
		emptyText?: string;
	} = $props();

	const root = $derived(buildFileTree(entries));

	function isExpanded(path: string) {
		return expandedNodes[path] ?? true;
	}
</script>

{#snippet renderNode(node: FileTreeNode)}
	{#each Array.from(node.children.values()) as child (child.path)}
		<div class="group">
			<div class="flex items-center gap-2 rounded-lg p-2 hover:bg-base-200">
				{#if child.isFile}
					<Icon icon="mdi:file-outline" class="h-4 w-4" />
				{:else}
					<button
						class="btn h-6 min-h-0 w-6 p-0 btn-ghost btn-xs"
						type="button"
						onclick={() => onToggleExpanded?.(child.path)}
					>
						<Icon
							icon={isExpanded(child.path) ? 'mdi:chevron-down' : 'mdi:chevron-right'}
							class="h-4 w-4"
						/>
					</button>
					<Icon icon="mdi:folder-outline" class="h-4 w-4" />
				{/if}

				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium" title={child.name}>{child.name}</p>
					{#if child.isFile && child.entry?.size !== undefined}
						<p class="text-xs text-base-content/60">{formatBytes(child.entry.size)}</p>
					{/if}
					{#if child.isFile && child.entry?.status}
						<div class="mt-1 flex items-center gap-2">
							<span class="badge badge-outline badge-xs">{child.entry.status}</span>
							{#if child.entry.progress !== undefined}
								<span class="text-xs text-base-content/60">{child.entry.progress}%</span>
							{/if}
							{#if child.entry.status === 'error' && onRetryFile}
								<button
									class="btn btn-ghost btn-xs"
									type="button"
									title={m.action_regenerate()}
									onclick={() => onRetryFile(child.entry!)}
								>
									<Icon icon="mdi:refresh" class="h-3.5 w-3.5" />
									{m.action_regenerate()}
								</button>
							{/if}
						</div>
					{/if}
					{#if child.isFile && child.entry?.progress !== undefined}
						<progress
							class="progress mt-1 h-1.5 w-full progress-primary"
							max="100"
							value={child.entry.progress}
						></progress>
					{/if}
				</div>

				{#if !readonly || (readonly && child.isFile && !!child.entry?.uploadId && !!onDownloadFile)}
					<div
						class="flex items-center gap-1 transition-opacity"
						class:opacity-100={child.isFile &&
							(child.entry?.status === 'uploading' || child.entry?.status === 'error')}
						class:opacity-60={!(
							child.isFile &&
							(child.entry?.status === 'uploading' || child.entry?.status === 'error')
						)}
						class:group-hover:opacity-100={!(
							child.isFile &&
							(child.entry?.status === 'uploading' || child.entry?.status === 'error')
						)}
					>
						{#if readonly && child.isFile && child.entry?.uploadId && onDownloadFile}
							<button
								class="btn btn-outline btn-xs"
								type="button"
								title={m.action_download_file()}
								onclick={() => onDownloadFile(child.entry!.uploadId!)}
							>
								<Icon icon="mdi:download" class="h-4 w-4" />
								{m.action_download()}
							</button>
						{:else}
							{#if !child.isFile}
								<button
									class="btn btn-ghost btn-xs"
									type="button"
									title={m.upload_files_to_folder()}
									onclick={() => onAddFilesToFolder?.(child.path)}
								>
									<Icon icon="mdi:plus" class="h-4 w-4" />
								</button>
							{/if}

							{#if child.isFile && child.entry}
								<button
									class="btn text-error btn-ghost btn-xs"
									type="button"
									title={m.action_remove_file()}
									onclick={() => onRemoveFile?.(child.entry!)}
								>
									<Icon icon="mdi:close" class="h-4 w-4" />
								</button>
							{:else}
								<button
									class="btn text-error btn-ghost btn-xs"
									type="button"
									title={m.action_remove_folder()}
									onclick={() => onRemoveFolder?.(child.path)}
								>
									<Icon icon="mdi:close" class="h-4 w-4" />
								</button>
							{/if}
						{/if}
					</div>
				{/if}
			</div>

			{#if !child.isFile && child.children.size > 0 && isExpanded(child.path)}
				<div class="ml-5 border-l border-base-300 pl-3">{@render renderNode(child)}</div>
			{/if}
		</div>
	{/each}
{/snippet}

{#if entries.length === 0}
	<div class="rounded-lg border border-base-300 p-4 text-sm text-base-content/60">{emptyText}</div>
{:else}
	<div class="rounded-lg border border-base-300 bg-base-100 p-2">{@render renderNode(root)}</div>
{/if}
