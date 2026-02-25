import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import pkg from '../package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.resolve(repoRoot, 'static', 'openapi.json');

const spec = swaggerJsdoc({
	definition: {
		openapi: '3.1.0',
		info: {
			title: `${pkg.name.charAt(0).toUpperCase() + pkg.name.slice(1)} API`,
			version: pkg.version,
			description: pkg.description
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
