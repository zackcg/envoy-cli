# envoy-cli

> A CLI tool for managing and syncing `.env` files across environments using encrypted remote vaults.

---

## Installation

```bash
npm install -g envoy-cli
```

Or with pnpm:

```bash
pnpm add -g envoy-cli
```

---

## Usage

Initialize a vault in your project:

```bash
envoy init
```

Push your local `.env` to the remote vault:

```bash
envoy push --env production
```

Pull the latest secrets to your local environment:

```bash
envoy pull --env staging
```

Sync across multiple environments at once:

```bash
envoy sync --from production --to staging
```

List all available environments in the vault:

```bash
envoy list
```

> **Note:** All secrets are encrypted before being sent to the remote vault. Your plaintext values never leave your machine unencrypted.

---

## Configuration

`envoy-cli` looks for an `envoy.config.json` file in your project root to define vault endpoints, environment names, and encryption settings. Run `envoy init` to generate one automatically.

---

## Requirements

- Node.js >= 18
- A configured remote vault endpoint (supports S3, HTTP, and local adapters)

---

## License

[MIT](./LICENSE) © 2024 envoy-cli contributors
