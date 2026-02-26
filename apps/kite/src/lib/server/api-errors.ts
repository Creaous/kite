export function getInternalErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : '';
}

export function includesInternalError(error: unknown, needle: string): boolean {
	return getInternalErrorMessage(error).toLowerCase().includes(needle.toLowerCase());
}
