# Security Policy

The Impactra team takes the security and integrity of our software change intelligence and release safety platform seriously. We appreciate the responsible disclosure of security vulnerabilities by security researchers and the community.

---

## Supported Versions

Only the latest active major release receives official security patches and bug fixes.

| Version | Supported | Notes |
|---|:---:|---|
| **v1.0.x** | :white_check_mark: | Current production release |
| < 1.0.0 | :x: | Pre-release foundational versions (unsupported) |

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential security risk in Impactra, please report it **responsibly and privately**.

### How to Report
- **Preferred Method:** Open a private security advisory through GitHub Security Advisories on the official repository.
- **Alternative Method:** Contact the core maintainers via secure email or direct communication through the official project channel.

### What to Include
Please provide detailed information to help us reproduce and resolve the issue quickly:
1. **Description:** A clear summary of the vulnerability and potential impact.
2. **Steps to Reproduce:** Step-by-step instructions or proof-of-concept code.
3. **Affected Components:** Specific files, API endpoints, or services involved.
4. **Environment:** Version, operating system, Docker configuration, and dependencies.
5. **Mitigation:** Any temporary workarounds or mitigations you have identified.

---

## What NOT to Post Publicly

To protect users and deployments:
- **Do NOT** open a public GitHub issue detailing an active security vulnerability or exploit.
- **Do NOT** publish proof-of-concept exploits or coordinate public disclosure before a security patch has been released.
- **Do NOT** post discovered credentials, tokens, or private keys on public forums or issue trackers.

---

## Credential Exposure Guidance

If you accidentally commit a real secret (API token, private key, database password, or session secret) into a Git repository:
1. **Revoke the credential immediately** at the provider (GitHub, AWS, database provider). Merely deleting the file or creating a commit that removes the file does NOT protect the exposed credential, as it remains visible in Git history.
2. Rotate all associated secrets and invalidate active sessions.
3. Contact repository administrators to coordinate safe history scrubbing (e.g. using `git-filter-repo` or BFG Repo-Cleaner) if necessary.

---

## Security Response SLA

- **Initial Response:** Within 48 hours of receipt.
- **Assessment & Triage:** Within 5 business days.
- **Patch Release:** Target within 14 business days depending on severity and complexity.
- **Public Disclosure:** Coordinated with the reporter following patch deployment.
