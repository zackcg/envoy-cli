import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { loadConfig } from "../config";
import { decrypt, deserializePayload, deriveKey } from "../crypto";
import { serializeEnvFile } from "../vault";
import { request } from "../remote";

/**
 * Prompts the user for a passphrase without echoing input to the terminal.
 */
function promptPassphrase(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Disable echoing for passphrase input
    const stdoutWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (data: string) =>
      data === "\n" || data === "\r\n" ? stdoutWrite(data) : true;

    rl.question(prompt, (answer) => {
      (process.stdout as any).write = stdoutWrite;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Resolves the target path for writing the pulled .env file.
 * Defaults to ".env" in the current working directory if not specified.
 */
function resolveOutputPath(outputArg?: string): string {
  if (outputArg) {
    return path.isAbsolute(outputArg)
      ? outputArg
      : path.resolve(process.cwd(), outputArg);
  }
  return path.resolve(process.cwd(), ".env");
}

/**
 * Pull command: fetches and decrypts an env file from a remote vault,
 * writing the result to the local filesystem.
 *
 * Usage: envoy pull <vault> [--env <environment>] [--output <file>]
 */
export async function pullCommand(args: {
  vault: string;
  env?: string;
  output?: string;
}): Promise<void> {
  const { vault: vaultName, env = "production", output } = args;

  // Load local configuration
  const config = await loadConfig();
  const vaultConfig = config.vaults[vaultName];

  if (!vaultConfig) {
    console.error(
      `Error: vault "${vaultName}" not found. Run \`envoy vault add ${vaultName}\` first.`
    );
    process.exit(1);
  }

  // Prompt for decryption passphrase
  const passphrase = await promptPassphrase(
    `Passphrase for vault "${vaultName}": `
  );

  if (!passphrase) {
    console.error("Error: passphrase cannot be empty.");
    process.exit(1);
  }

  try {
    console.log(`Pulling "${env}" from vault "${vaultName}"...`);

    // Fetch the encrypted payload from the remote vault
    const response = await request({
      baseUrl: vaultConfig.url,
      method: "GET",
      path: `/vaults/${vaultName}/envs/${env}`,
      token: vaultConfig.token,
    });

    if (!response.payload) {
      console.error(`Error: no data found for environment "${env}" in vault "${vaultName}".`);
      process.exit(1);
    }

    // Deserialize and decrypt the payload
    const encryptedPayload = deserializePayload(response.payload);
    const key = await deriveKey(passphrase, encryptedPayload.salt);
    const decryptedJson = await decrypt(encryptedPayload, key);

    // Parse the decrypted data and serialize back to .env format
    const envVars: Record<string, string> = JSON.parse(decryptedJson);
    const envFileContent = serializeEnvFile(envVars);

    // Write to output path
    const outputPath = resolveOutputPath(output);
    fs.writeFileSync(outputPath, envFileContent, "utf-8");

    console.log(`✓ Successfully pulled ${Object.keys(envVars).length} variable(s) to ${outputPath}`);
  } catch (err: any) {
    if (err.message?.includes("decrypt") || err.message?.includes("tag")) {
      console.error("Error: decryption failed — incorrect passphrase or corrupted data.");
    } else {
      console.error(`Error: ${err.message ?? err}`);
    }
    process.exit(1);
  }
}
