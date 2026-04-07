import { loadConfig } from "../config";
import { encrypt, serializePayload, deriveKey } from "../crypto";
import { parseEnvFile } from "../vault";
import { request } from "../remote";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Prompts the user for a passphrase without echoing input.
 */
function promptPassphrase(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Disable echoing for passphrase input
    const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
    if (stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    process.stdout.write(prompt);
    let passphrase = "";

    process.stdin.on("data", (char: Buffer) => {
      const c = char.toString();
      if (c === "\n" || c === "\r" || c === "\u0004") {
        if (stdin.setRawMode) stdin.setRawMode(false);
        process.stdout.write("\n");
        rl.close();
        resolve(passphrase);
      } else if (c === "\u0003") {
        process.exit();
      } else if (c === "\u007f") {
        passphrase = passphrase.slice(0, -1);
      } else {
        passphrase += c;
      }
    });
  });
}

/**
 * Resolves the path to the .env file for the given environment.
 * Falls back to `.env` in the current working directory.
 */
function resolveEnvFilePath(env: string): string {
  const candidates = [
    path.resolve(process.cwd(), `.env.${env}`),
    path.resolve(process.cwd(), `.env`),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `No .env file found for environment "${env}". Tried: ${candidates.join(", ")}`
  );
}

/**
 * push command — encrypts the local .env file and uploads it to the remote vault.
 *
 * Usage: envoy push <vault> [--env <environment>]
 */
export async function pushCommand(
  vaultName: string,
  options: { env?: string } = {}
): Promise<void> {
  const env = options.env ?? "production";
  const config = loadConfig();

  const vault = config.vaults.find((v) => v.name === vaultName);
  if (!vault) {
    console.error(`Vault "${vaultName}" not found. Run \`envoy vault add\` to register it.`);
    process.exit(1);
  }

  // Locate and parse the local .env file
  let envFilePath: string;
  try {
    envFilePath = resolveEnvFilePath(env);
  } catch (err: unknown) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const rawEnv = fs.readFileSync(envFilePath, "utf-8");
  const envVars = parseEnvFile(rawEnv);
  const envCount = Object.keys(envVars).length;

  console.log(`Pushing ${envCount} variable(s) from "${envFilePath}" to vault "${vaultName}" [${env}]...`);

  const passphrase = await promptPassphrase("Enter passphrase: ");

  // Derive encryption key from passphrase and vault name (used as salt context)
  const { key, salt } = await deriveKey(passphrase);
  const plaintext = JSON.stringify(envVars);
  const encrypted = await encrypt(plaintext, key);
  const payload = serializePayload({ ...encrypted, salt });

  try {
    await request(
      vault.url,
      "PUT",
      `/vaults/${encodeURIComponent(vaultName)}/envs/${encodeURIComponent(env)}`,
      { payload },
      vault.token
    );
    console.log(`✓ Successfully pushed "${env}" to vault "${vaultName}".`);
  } catch (err: unknown) {
    console.error(`Failed to push to remote vault: ${(err as Error).message}`);
    process.exit(1);
  }
}
