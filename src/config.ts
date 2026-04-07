/**
 * Configuration management for envoy-cli
 * Handles reading and writing the local .envoy config file
 * which stores vault connection details and preferences
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface VaultConfig {
  url: string;
  token?: string;
  alias: string;
}

export interface EnvoyConfig {
  version: string;
  defaultVault?: string;
  vaults: Record<string, VaultConfig>;
  encryptionKeyPath?: string;
  syncedAt?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.envoy');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_CONFIG: EnvoyConfig = {
  version: '1.0.0',
  vaults: {},
};

/**
 * Ensures the config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Loads the envoy configuration from disk.
 * Returns the default config if none exists yet.
 */
export function loadConfig(): EnvoyConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<EnvoyConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    throw new Error(`Failed to parse envoy config at ${CONFIG_FILE}: ${(err as Error).message}`);
  }
}

/**
 * Persists the envoy configuration to disk.
 */
export function saveConfig(config: EnvoyConfig): void {
  ensureConfigDir();

  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    throw new Error(`Failed to save envoy config: ${(err as Error).message}`);
  }
}

/**
 * Adds or updates a vault entry in the config.
 */
export function upsertVault(alias: string, vault: Omit<VaultConfig, 'alias'>): EnvoyConfig {
  const config = loadConfig();
  config.vaults[alias] = { ...vault, alias };

  if (!config.defaultVault) {
    config.defaultVault = alias;
  }

  saveConfig(config);
  return config;
}

/**
 * Removes a vault entry from the config.
 */
export function removeVault(alias: string): EnvoyConfig {
  const config = loadConfig();

  if (!config.vaults[alias]) {
    throw new Error(`Vault "${alias}" not found in config.`);
  }

  delete config.vaults[alias];

  if (config.defaultVault === alias) {
    const remaining = Object.keys(config.vaults);
    config.defaultVault = remaining.length > 0 ? remaining[0] : undefined;
  }

  saveConfig(config);
  return config;
}

/**
 * Returns the path to the global config directory.
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
