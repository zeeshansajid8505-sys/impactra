# Impactra — GitHub App Configuration Guide

**Project Name:** Impactra — AI-Powered Software Change Intelligence & Release Safety Platform
**Phase:** Phase 04 — GitHub App Integration, Installation Lifecycle & Repository Onboarding
**Document Version:** 1.0.0
**Date:** 2026-09-23

---

## 1. Overview & Architectural Boundaries

Impactra integrates with GitHub via a dedicated GitHub App to synchronize repository metadata and receive real-time webhook change events.

### Phase 04 Scope & Prohibitions
- **Scope**: Connection, authentication, installation lifecycle, metadata onboarding, and secure webhook verification.
- **Strict Prohibitions**:
  - NO repository source code cloning or tarball downloading.
  - NO arbitrary execution of repository code or Dockerfiles.
  - NO AST or syntax tree parsing of repository code files (deferred to Phase 05+).
  - NO GitHub Checks or Pull Request status comments (deferred to Phase 05+).

---

## 2. Registering the GitHub App

1. Navigate to your GitHub account or organization settings:
   - Personal account: **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
   - Organization: **Organization Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**

2. Configure GitHub App Details:
   - **GitHub App name**: `Impactra` (or a unique variant, e.g. `impactra-local-dev`)
   - **Description**: AI-Powered Software Change Intelligence & Release Safety Platform
   - **Homepage URL**: `http://impactra.local` (or your domain `https://app.impactra.io`)

3. Configure Identifying URLs:
   - **Callback URL**:
     - Local development: `http://impactra.local:3001/github/installations/callback`
     - Production: `https://api.impactra.io/github/installations/callback`
   - **Request user authorization (OAuth) during installation**: Unchecked (installation flow uses App installation state).
   - **Setup URL (redirect URL after installation)**:
     - Local development: `http://impactra.local:3001/github/installations/callback`
     - Production: `https://api.impactra.io/github/installations/callback`
   - **Redirect on update**: Checked

4. Configure Webhooks:
   - **Active**: Checked
   - **Webhook URL**:
     - Local development: `http://impactra.local:3001/github/webhooks` (or your Smee.io / ngrok forwarder URL)
     - Production: `https://api.impactra.io/github/webhooks`
   - **Webhook secret**: Generate a 32-byte secure random string:
     ```bash
     openssl rand -hex 32
     ```
   - **SSL verification**: Enable SSL verification (in production).

---

## 3. Required Permissions & Subscribed Events

### Repository Permissions
| Permission | Access | Purpose |
| :--- | :--- | :--- |
| **Contents** | Read-only | Reading repository configuration and metadata |
| **Metadata** | Read-only | Default mandatory permission for repository information |
| **Pull requests** | Read-only | Ingesting PR metadata and change context |
| **Commit statuses** | Read-only | Future release gate validation (Phase 06+) |
| **Checks** | Read-only | Future checks reporting (Phase 06+) |

> [!IMPORTANT]
> Do NOT grant write access. Phase 04 operates strictly on read-only repository metadata.

### Organization Permissions
| Permission | Access | Purpose |
| :--- | :--- | :--- |
| **Members** | Read-only | Validating organization membership during onboarding |

### Subscribed Webhook Events
Under **Subscribe to events**, select:
- [x] **Installation** (`created`, `deleted`, `suspend`, `unsuspend`)
- [x] **Installation target** (`renamed`)
- [x] **Installation repositories** (`added`, `removed`)
- [x] **Repository** (`created`, `archived`, `unarchived`, `renamed`, `deleted`)
- [x] **Ping**

---

## 4. Private Key & Credentials Generation

1. After creating the app, note down the **App ID** and **App Slug**.
2. Scroll to the bottom and click **Generate a private key**.
3. A `.pem` file will be downloaded to your computer.
4. Convert the `.pem` file to base64 encoding for environment configuration:

### Linux / macOS
```bash
base64 -w 0 impactra-app.private-key.pem > private-key.base64.txt
```

### Windows (PowerShell)
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("impactra-app.private-key.pem")) | Set-Content -NoNewline private-key.base64.txt
```

---

## 5. Environment Variables Configuration

Add the following variables to your `.env` file (and in `compose.yaml`):

```ini
# GitHub App Integration
GITHUB_APP_ID=123456
GITHUB_APP_SLUG=impactra-app
GITHUB_APP_PRIVATE_KEY_BASE64=<paste_single_line_base64_string_here>
GITHUB_WEBHOOK_SECRET=<your_32_byte_hex_secret>
GITHUB_API_URL=https://api.github.com
GITHUB_WEB_URL=https://github.com
```

### Verification
Once configured, query the safe configuration status endpoint:
```bash
curl http://localhost:3001/github/config/status
```
Expected response:
```json
{
  "configured": true,
  "appSlug": "impactra-app",
  "installationsEnabled": true,
  "appIdConfigured": true,
  "slugConfigured": true,
  "privateKeyConfigured": true,
  "webhookSecretConfigured": true,
  "installUrl": "https://github.com/apps/impactra-app/installations/new"
}
```

---

## 6. Local Webhook Forwarding with Smee.io

When testing locally behind NAT or on `impactra.local`:

1. Visit [https://smee.io](https://smee.io) and click **Start a new channel**.
2. Copy the Smee channel URL (e.g., `https://smee.io/AbCdEfGhIjKlMnOp`).
3. Set your GitHub App's **Webhook URL** to the Smee channel URL.
4. Run the Smee client locally:
   ```bash
   npx smee-client --url https://smee.io/AbCdEfGhIjKlMnOp --target http://localhost:3001/github/webhooks
   ```
5. Events sent by GitHub will be forwarded to your local API with valid HMAC-SHA256 headers.

---

## 7. Official Authentication Architecture (@octokit/auth-app & @octokit/rest)

Impactra's backend utilizes official Octokit libraries for GitHub App identity and installation authentication:
- **`@octokit/auth-app` (v8.3.1)**: Manages official `createAppAuth` authentication strategies, generating App JWTs and minting scoped installation access tokens.
- **`@octokit/rest` (v22.0.1)**: Official GitHub REST client with automatic pagination (`octokit.paginate`) and error handling.

### Key Security Invariants
1. **Zero Hand-Rolled JWTs**: All cryptographic token operations are delegated to `@octokit/auth-app`. Hand-rolled Node crypto JWT assembly has been eliminated.
2. **Lazy Initialization**: The application boots without credentials when `GITHUB_APP_ID` or private keys are not supplied. Only authenticated requests trigger credential checks.
3. **Short-Lived Installation Token Caching**: Tokens are cached in Redis under `impactra:github:inst-token:<installationId>` with an explicit 90-second safety margin below provider expiration.
4. **Cache Invalidation**: Disconnect, suspend, delete, and re-authentication events immediately purge cached tokens from Redis.
5. **Private Key Isolation**: Private keys are decoded in memory, never persisted to PostgreSQL or Redis, never output in logs, and never returned in API payloads.
