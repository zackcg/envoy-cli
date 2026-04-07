/**
 * remote.ts
 * Handles communication with remote vault storage backends.
 * Currently supports a simple HTTP/HTTPS endpoint for pushing and pulling
 * encrypted vault payloads.
 */

import https from "https";
import http from "http";
import { URL } from "url";

export interface RemoteConfig {
  url: string;
  token?: string;
}

export interface PushResult {
  success: boolean;
  message?: string;
  version?: string;
}

export interface PullResult {
  success: boolean;
  data?: string;
  version?: string;
  message?: string;
}

/**
 * Sends a JSON request to the remote vault endpoint.
 */
function request(
  method: "GET" | "POST" | "PUT",
  remote: RemoteConfig,
  path: string,
  body?: object
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(remote.url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : undefined;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname.replace(/\/$/, "")}${path}`,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        ...(remote.token ? { Authorization: `Bearer ${remote.token}` } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () =>
        resolve({ statusCode: res.statusCode ?? 0, body: data })
      );
    });

    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Pushes an encrypted vault payload to the remote server.
 * @param remote - Remote configuration (URL + optional auth token)
 * @param vaultName - The name of the vault being pushed
 * @param encryptedPayload - Base64-encoded encrypted payload string
 */
export async function pushVault(
  remote: RemoteConfig,
  vaultName: string,
  encryptedPayload: string
): Promise<PushResult> {
  try {
    const { statusCode, body } = await request("PUT", remote, `/vaults/${encodeURIComponent(vaultName)}`, {
      payload: encryptedPayload,
    });

    if (statusCode === 200 || statusCode === 201) {
      const parsed = JSON.parse(body);
      return { success: true, message: parsed.message, version: parsed.version };
    }

    return { success: false, message: `Server responded with status ${statusCode}: ${body}` };
  } catch (err: any) {
    return { success: false, message: err.message ?? "Unknown error during push" };
  }
}

/**
 * Pulls an encrypted vault payload from the remote server.
 * @param remote - Remote configuration (URL + optional auth token)
 * @param vaultName - The name of the vault to pull
 */
export async function pullVault(
  remote: RemoteConfig,
  vaultName: string
): Promise<PullResult> {
  try {
    const { statusCode, body } = await request("GET", remote, `/vaults/${encodeURIComponent(vaultName)}`);

    if (statusCode === 200) {
      const parsed = JSON.parse(body);
      return { success: true, data: parsed.payload, version: parsed.version };
    }

    if (statusCode === 404) {
      return { success: false, message: `Vault "${vaultName}" not found on remote.` };
    }

    return { success: false, message: `Server responded with status ${statusCode}: ${body}` };
  } catch (err: any) {
    return { success: false, message: err.message ?? "Unknown error during pull" };
  }
}
