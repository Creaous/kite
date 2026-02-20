import { spawn } from 'node:child_process';

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: 'inherit',
			env: process.env
		});

		child.on('exit', (code) => {
			if (code === 0) return resolve();
			reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
		});
		child.on('error', reject);
	});
}

function runServer() {
	const server = spawn('node', ['build'], {
		stdio: 'inherit',
		env: process.env
	});

	const forwardSignal = (signal) => {
		if (!server.killed) server.kill(signal);
	};

	process.on('SIGINT', forwardSignal);
	process.on('SIGTERM', forwardSignal);

	server.on('exit', (code) => {
		process.exit(code ?? 1);
	});
	server.on('error', (error) => {
		console.error('Server failed to start:', error);
		process.exit(1);
	});
}

try {
	if (process.env.RUN_DB_MIGRATIONS !== 'false') {
		await run('node', ['scripts/migrate.mjs']);
	} else {
		console.log('Skipping DB migrations (RUN_DB_MIGRATIONS=false)');
	}

	runServer();
} catch (error) {
	console.error('Startup failed:', error);
	process.exit(1);
}
