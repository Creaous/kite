# Security Policy

Security is a priority for Kite.
If you discover a vulnerability, please report it responsibly so it can be addressed quickly and safely.

## Table of Contents

- [Supported Versions](#supported-versions)
- [How to Report a Vulnerability](#how-to-report-a-vulnerability)
- [What to Include in a Report](#what-to-include-in-a-report)
- [Disclosure Process](#disclosure-process)
- [Response and Remediation Expectations](#response-and-remediation-expectations)
- [Security Fix Contribution Guidelines](#security-fix-contribution-guidelines)
- [Secure Development Notes](#secure-development-notes)

## Supported Versions

Security fixes are generally applied to active development branches and current production-targeted code.
If you are running an older deployment, update to the latest available version before reporting behavior that might already be fixed.

## How to Report a Vulnerability

Please **do not** open public issues for security vulnerabilities.

Report privately by contacting the maintainers through one of the private channels below:

- Project security contact email (preferred): [kite-security@creaous.net](mailto:kite-security@creaous.net)
- Primary maintainer contact on Matrix ([@Mitchell](https://git.codeguilds.org/Mitchell)): [matrix.to/#/@mitchell:codeguilds.org](https://matrix.to/#/@mitchell:codeguilds.org)

If no direct security contact is published, open a minimal private contact request and ask for a secure channel for disclosure.

## What to Include in a Report

Include as much of the following as possible:

- Vulnerability type (e.g., auth bypass, IDOR, SSRF, SQL injection, XSS)
- Affected endpoints/routes/components
- Reproduction steps
- Proof-of-concept (request/response snippets, screenshots, logs)
- Impact assessment (what an attacker can do)
- Suggested mitigation (if known)
- Environment details (version/commit, config assumptions)

Reports that are clear and reproducible can be triaged much faster.

## Disclosure Process

1. Maintainers acknowledge receipt.
2. Report is triaged and severity is assessed.
3. A fix is prepared and validated.
4. Coordinated disclosure timeline is agreed (when applicable).
5. Fix is released and advisory/changelog details are published as needed.

Please avoid public disclosure until maintainers confirm remediation is available.

## Response and Remediation Expectations

Target timelines (best effort):

- Initial acknowledgement: within 3 business days
- Triage decision: within 7 business days
- Critical vulnerabilities: expedited handling

Actual timelines may vary based on complexity and maintainer availability.

## Security Fix Contribution Guidelines

If you contribute a security fix via pull request:

1. Keep the PR focused and avoid unrelated refactors.
2. Avoid leaking exploit details in public discussion before a patch is released.
3. Add/adjust tests for the vulnerable behavior when possible.
4. Run required quality checks before committing:

   ```bash
   pnpm check
   pnpm format
   pnpm lint
   ```

5. Use Conventional Commits for commit messages.

### Conventional Commit examples for security-related work

```text
fix(auth): prevent token replay in password reset flow
fix(api): enforce ownership check on share deletion endpoint
test(security): add regression test for unauthorized file access
docs(security): document private vulnerability reporting workflow
```

### Example with breaking change

```text
fix(auth): require stronger session validation middleware

BREAKING CHANGE: legacy session tokens are no longer accepted
```

## Secure Development Notes

When implementing features or fixes:

- Validate all untrusted input.
- Enforce server-side authorization on every sensitive action.
- Use least-privilege access patterns for services and credentials.
- Do not log secrets, tokens, or sensitive personal data.
- Keep dependencies updated and review dependency changes carefully.

If you are unsure whether behavior is security-relevant, treat it as security-relevant and escalate early.
