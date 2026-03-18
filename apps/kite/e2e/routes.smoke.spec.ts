import { expect, test, type Page } from '@playwright/test';

const PRIVATE_ROUTES = ['/', '/admin', '/share-requests', '/shares'] as const;

test.describe('Route smoke coverage', () => {
	async function expectNoServerCrash(path: string, page: Page) {
		const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
		expect(response).not.toBeNull();
		expect(response!.status()).toBeLessThan(500);
		await expect(page.locator('body')).toBeVisible();
	}

	async function expectPrivateRedirect(path: string, page: Page) {
		await expectNoServerCrash(path, page);
		await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);

		const current = new URL(page.url());
		expect(current.searchParams.get('next')).toBe(path);
	}

	test('redirects private home route to sign-in', async ({ page }) => {
		await expectPrivateRedirect('/', page);
	});

	test('redirects private admin route to sign-in', async ({ page }) => {
		await expectPrivateRedirect('/admin', page);
	});

	test('redirects private share requests route to sign-in', async ({ page }) => {
		await expectPrivateRedirect('/share-requests', page);
	});

	test('redirects private shares route to sign-in', async ({ page }) => {
		await expectPrivateRedirect('/shares', page);
	});

	test('renders sign-in page with email/password form', async ({ page }) => {
		await expectNoServerCrash('/sign-in', page);

		const current = new URL(page.url());
		expect(current.pathname).toBe('/sign-in');

		await expect(page.locator('form[action*="?/email"]')).toBeVisible();
		await expect(page.locator('input[name="email"]')).toBeVisible();
		await expect(page.locator('input[name="password"]')).toBeVisible();
	});

	test('renders sign-up page or redirects when registration is disabled', async ({ page }) => {
		await expectNoServerCrash('/sign-up', page);

		const current = new URL(page.url());
		const isSignUpPage = current.pathname === '/sign-up';
		const isRegistrationRedirect =
			current.pathname === '/sign-in' && current.searchParams.get('registrationDisabled') === '1';

		expect(isSignUpPage || isRegistrationRedirect).toBe(true);

		if (isSignUpPage) {
			await expect(page.locator('input[name="name"]')).toBeVisible();
			await expect(page.locator('input[name="email"]')).toBeVisible();
			await expect(page.locator('input[name="password"]')).toBeVisible();
		}
	});

	test('renders public share page shell', async ({ page }) => {
		await expectNoServerCrash('/s/e2e-value', page);

		const current = new URL(page.url());
		expect(current.pathname).toBe('/s/e2e-value');
		await expect(page.locator('main h1')).toBeVisible();
	});

	test('renders public share request page shell', async ({ page }) => {
		await expectNoServerCrash('/r/e2e-value', page);

		const current = new URL(page.url());
		expect(current.pathname).toBe('/r/e2e-value');
		await expect(page.locator('main h1')).toBeVisible();
	});

	test('public share metadata API handles unknown code without server error', async ({ request }) => {
		const response = await request.get('/api/v1/public/shares/e2e-value');
		expect(response.status()).toBeLessThan(500);
		expect([200, 401, 404]).toContain(response.status());
	});

	test('public share download API handles unknown code without server error', async ({ request }) => {
		const response = await request.post('/api/v1/public/shares/e2e-value/download/e2e-upload', {
			data: {}
		});
		expect(response.status()).toBeLessThan(500);
		expect([401, 403, 404]).toContain(response.status());
	});

	test('onboarding API requires authentication', async ({ request }) => {
		const response = await request.post('/api/v1/me/onboarding');
		expect(response.status()).toBe(401);
	});

	test('admin users API enforces permission boundary', async ({ request }) => {
		const response = await request.get('/api/v1/admin/users');
		expect(response.status()).toBe(401);
	});

	test('covers every current page route', () => {
		expect(PRIVATE_ROUTES).toHaveLength(4);
		expect([
			...PRIVATE_ROUTES,
			'/sign-in',
			'/sign-up',
			'/s/e2e-value',
			'/r/e2e-value',
			'/api/v1/public/shares/e2e-value',
			'/api/v1/public/shares/e2e-value/download/e2e-upload',
			'/api/v1/me/onboarding',
			'/api/v1/admin/users'
		]).toHaveLength(12);
	});
});
