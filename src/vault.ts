/**
 * vault.ts
 * Handles reading, writing, and syncing encrypted .env files to/from remote vaults.
 * Supports local file operations and remote HTTP-based vault endpoints.
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import { encrypt, decrypt, serializePayload, deserializePayload } from "./crypto";
import { VaultConfig } from "./config";

export interface EnvMap {
  [key: string]: string;
}

/**
 * Parse a .env file string into a key-value map.
 * Ignores comments and blank lines.
 */
export function parseEnvFile(content: string): EnvMap {
  const result: EnvMap = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // Strip surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Serialize a key-value map back into .env file format.
 */
export function serializeEnvFile(envMap: EnvMap): string {
  return Object.entries(envMap)
    .map(([key, value]) => {
      // Quote values that contain spaces or special characters
      const needsQuotes = /[\s#"'\\]/.test(value);
      return needsQuotes ? `${key}="${value.replace(/"/g, '\\"')}"` : `${key}=${value}`;
    })
    .join("\n") + "\n";
}

/**
 * Encrypt an env map and return a serialized payload string.
 */
export async function encryptEnv(envMap: EnvMap, password: string): Promise<string> {
  const plaintext = serializeEnvFile(envMap);
  const payload = await encrypt(plaintext, password);
  return serializePayload(payload);
}

/**
 * Decrypt a serialized payload string and return an env map.
 */
export async function decryptEnv(serialized: string, password: string): Promise<EnvMap> {
  const payload = deserializePayload(serialized);
  const plaintext = await decrypt(payload, password);
  return parseEnvFile(plaintext);
}

/**
 * Push encrypted env data to a remote vault endpoint via HTTP/HTTPS PUT.
 */
export async function pushToRemote(
  vault: VaultConfig,
  encryptedPayload: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(vault.url);
    const body = Buffer.from(JSON.stringify({ payload: encryptedPayload }));
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body.length,
        ...(vault.token ? { Authorization: `Bearer ${vault.token}` } : {}),
      },
    };
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
        resolve();
      } else {
        reject(new Error(`Remote vault returned status ${res.statusCode}`));
      }
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Pull encrypted env data from a remote vault endpoint via HTTP/HTTPS GET.
 */
export async function pullFromRemote(vault: VaultConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(vault.url);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      method: "GET",
      headers: {
        ...(vault.token ? { Authorization: `Bearer ${vault.token}` } : {}),
      },
    };
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(options, (res) => {
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`Remote vault returned status ${res.statusCode}`));
        return;
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.payload as string);
        } catch {
          reject(new Error("Failed to parse remote vault response"));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
