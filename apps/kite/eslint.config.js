import path from 'node:path';
import { createSvelteConfig } from '../../packages/eslint-config/svelte.js';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default createSvelteConfig({ gitignorePath, svelteConfig });
