# Contributing to Typeshelf

Thanks for helping. Bug reports, fixes, translations and font-provider improvements are all welcome.

## Before you start

- **Bugs:** open an issue with the bug template. Include your Windows version and the log file
  (`%APPDATA%\Typeshelf\logs\main.log`).
- **Features:** open a feature request first so we can agree on the approach before you write code.
- **Security problems:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

You need Windows 10 or 11 and Node.js 24.

```bash
npm ci
npm run dev        # the app, with hot reload
npm run dev:web    # the UI only, in a browser, with sample data (http://localhost:5199)
```

## Before opening a pull request

```bash
npm run typecheck
npm test
npm run test:e2e        # drives the real app; see docs/TESTING.md
npm run notices:check   # only fails if you changed dependencies
```

- Keep pull requests focused on one change.
- Add or update tests in `tests/` for logic changes. Pure logic belongs in `src/shared/` or
  `src/main/providers/select.ts` so it can be tested without Electron.
- Changes to activation (`src/main/activation/`) touch the Windows registry. Run
  `node scripts/activation-e2e.mts` on a Windows machine and say so in the pull request.

## Dependencies

Typeshelf is licensed under GPL-3.0-or-later, so every dependency that ships inside the app must use a
compatible licence. `npm run notices` regenerates `THIRD_PARTY_NOTICES.md` and fails if a licence isn't on
the allowlist in `scripts/third-party-notices.cjs`.

Versions are pinned on purpose. Please don't bump Electron or other major versions in an unrelated pull
request: Electron upgrades also need an antivirus check of the new binaries before release.

## Licence of contributions

By submitting a pull request you agree that your contribution is licensed under GPL-3.0-or-later, the same
licence as the project.

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
