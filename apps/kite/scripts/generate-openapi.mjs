import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(repoRoot, 'static', 'openapi.json');

const spec = swaggerJsdoc({
	definition: {
		openapi: '3.0.3',
		info: {
			title: 'Kite API',
			version: '1.0.0',
			description: 'API reference generated from route-level OpenAPI JSDoc comments.'
		},
		servers: [{ url: 'http://localhost:5173', description: 'Local development server' }],
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					bearerFormat: 'JWT'
				}
			}
		}
	},
	apis: [path.resolve(repoRoot, 'src/routes/api/v1/**/+server.ts')]
});

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

console.log(`OpenAPI spec generated at ${outputPath}`);
