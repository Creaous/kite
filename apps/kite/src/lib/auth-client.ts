import { resolveAuthPluginIds } from '$lib/auth/plugins';
import { ac, admin, trusted, user } from '$lib/permissions';
import { passkeyClient } from '@better-auth/passkey/client';
import { adminClient, anonymousClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/svelte';

const isAnonymousEnabled = import.meta.env.PUBLIC_ALLOW_ANONYMOUS_USERS === 'true';
const isPasskeyEnabled = import.meta.env.PUBLIC_ALLOW_PASSKEYS !== 'false';

const enabledPluginIds = resolveAuthPluginIds({
	anonymous: isAnonymousEnabled,
	passkey: isPasskeyEnabled
});

export const authClient = createAuthClient({
	plugins: [
		adminClient({
			ac,
			roles: {
				admin,
				user,
				trusted
			}
		}),
		...(enabledPluginIds.has('anonymous') ? [anonymousClient()] : []),
		...(enabledPluginIds.has('passkey') ? [passkeyClient()] : [])
	]
});
