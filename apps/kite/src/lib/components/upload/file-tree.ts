export type FileTreeEntry = {
	id: string;
	name: string;
	relativePath: string;
	size?: number;
	status?: string;
	progress?: number;
	uploadId?: string;
};

export type FileTreeNode = {
	name: string;
	path: string;
	isFile: boolean;
	children: Map<string, FileTreeNode>;
	entry?: FileTreeEntry;
};

export function buildFileTree(entries: FileTreeEntry[]): FileTreeNode {
	const root: FileTreeNode = {
		name: 'root',
		path: '',
		isFile: false,
		children: new Map()
	};

	for (const entry of entries) {
		const normalizedPath = normalizeRelativePath(entry.relativePath || entry.name);
		const parts = normalizedPath.split('/').filter(Boolean);
		let current = root;
		let currentPath = '';

		for (let index = 0; index < parts.length; index++) {
			const part = parts[index];
			const isLeaf = index === parts.length - 1;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					path: currentPath,
					isFile: isLeaf,
					children: new Map(),
					entry: isLeaf ? entry : undefined
				});
			}

			current = current.children.get(part)!;
		}
	}

	return root;
}

export function normalizeRelativePath(path: string) {
	return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function formatBytes(size: number) {
	if (!Number.isFinite(size) || size <= 0) return '0 B';
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
