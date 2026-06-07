# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Do NOT open a public issue for security vulnerabilities.

Email: gunes.bizim@proton.me

Response time: < 48 hours. We will coordinate the fix and disclosure timeline.

## Security Scans

This repository uses:

- **CodeQL** — semantic code analysis for JS/TS (runs on push, PR, and weekly schedule)
- **Dependabot** — automated dependency updates with security alerts
- **Secret scanning** — detects leaked credentials in commits
- **Push protection** — blocks commits containing secrets before they reach GitHub
- **Dependency review** — diffs dependency changes in PRs, blocks known-malicious packages
- **npm audit** — runs on every CI build

## Responsible Disclosure

1. Report privately — do not post publicly
2. Allow 90 days for fix before public disclosure
3. We will acknowledge within 48 hours
4. Credit will be given in release notes (unless you request anonymity)
