#!/usr/bin/env node

/**
 * envoy-cli - A CLI tool for managing and syncing .env files
 * across environments using encrypted remote vaults.
 *
 * Main entry point for the CLI application.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

const program = new Command();

program
  .name('envoy')
  .description('Manage and sync .env files across environments using encrypted remote vaults')
  .version(pkg.version, '-v, --version', 'Output the current version');

/**
 * `envoy init` — Initialize a new vault configuration in the current project.
 */
program
  .command('init')
  .description('Initialize envoy in the current project directory')
  .option('--vault <url>', 'Remote vault URL to connect to')
  .option('--env <environment>', 'Default environment name (e.g. development, staging, production)', 'development')
  .action(async (options) => {
    const { init } = await import('./commands/init');
    await init(options);
  });

/**
 * `envoy push` — Encrypt and push the local .env file to the remote vault.
 */
program
  .command('push')
  .description('Encrypt and push local .env to the remote vault')
  .option('-e, --env <environment>', 'Target environment', 'development')
  .option('-f, --file <path>', 'Path to the .env file', '.env')
  .option('--force', 'Overwrite remote secrets without confirmation', false)
  .action(async (options) => {
    const { push } = await import('./commands/push');
    await push(options);
  });

/**
 * `envoy pull` — Fetch and decrypt secrets from the remote vault into a local .env file.
 */
program
  .command('pull')
  .description('Pull and decrypt secrets from the remote vault into a local .env file')
  .option('-e, --env <environment>', 'Source environment', 'development')
  .option('-f, --file <path>', 'Output .env file path', '.env')
  .option('--overwrite', 'Overwrite existing local .env without prompting', false)
  .action(async (options) => {
    const { pull } = await import('./commands/pull');
    await pull(options);
  });

/**
 * `envoy list` — List all environments stored in the remote vault.
 */
program
  .command('list')
  .description('List all environments available in the remote vault')
  .action(async () => {
    const { list } = await import('./commands/list');
    await list();
  });

/**
 * `envoy diff` — Show differences between local .env and the remote vault secrets.
 */
program
  .command('diff')
  .description('Show diff between local .env and remote vault secrets')
  .option('-e, --env <environment>', 'Environment to compare against', 'development')
  .option('-f, --file <path>', 'Local .env file to compare', '.env')
  .action(async (options) => {
    const { diff } = await import('./commands/diff');
    await diff(options);
  });

// Parse CLI arguments
program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`\n  Error: ${err.message}`);
  process.exit(1);
});
