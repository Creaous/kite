export const AUTH_PLUGIN_IDS = ['admin', 'anonymous', 'passkey'] as const;

export type AuthPluginId = (typeof AUTH_PLUGIN_IDS)[number];

export type AuthPluginFlags = {
	anonymous: boolean;
	passkey: boolean;
};

export function resolveAuthPluginIds(flags: AuthPluginFlags): Set<AuthPluginId> {
	const pluginIds = new Set<AuthPluginId>(['admin']);

	if (flags.anonymous) pluginIds.add('anonymous');
	if (flags.passkey) pluginIds.add('passkey');

	return pluginIds;
}

export function isAuthPluginId(value: string): value is AuthPluginId {
	return AUTH_PLUGIN_IDS.includes(value as AuthPluginId);
}

export function toOrderedAuthPluginIds(pluginIds: ReadonlySet<AuthPluginId>): AuthPluginId[] {
	return AUTH_PLUGIN_IDS.filter((pluginId) => pluginIds.has(pluginId));
}
