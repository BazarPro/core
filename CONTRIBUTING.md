# Contributing to BazarPro

Thank you for your interest in contributing to BazarPro! We welcome contributions from everyone.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

- Check the [Issues](https://github.com/BazarPro/core/issues) to see if the bug has already been reported.
- If not, create a new issue. Include a clear title, a description of the problem, and steps to reproduce the issue.

### Suggesting Enhancements

- Open a new issue with the tag "enhancement".
- Explain the feature you'd like to see and why it would be useful.

### Pull Requests

1. Fork the repository.
2. Create a new branch for your feature or bugfix from `development` (`git switch development && git switch -c feature/my-feature`).
3. Make your changes.
4. Ensure all tests pass (`npm run test:all`).
5. Commit your changes following our [commit conventions](#commit-conventions).
6. Push to your branch (`git push origin feature/my-feature`).
7. Open a Pull Request against the `development` branch. `development` is the integration branch; `main` reflects production and only receives merges from `development` (see [pipeline.md](./pipeline.md#release-process)).

## Development Setup

See the [README.md](./README.md) for instructions on setting up your local development environment.

## Translations

BazarPro is available in German (source language) and English. All texts live in
`src/locales/<language>/<area>.json`, one file per area (`common`, `auth`, `account`, …).

- **Changing or adding a text:** edit the German file first; the key structure of
  `src/locales/de` is the reference. TypeScript checks every `t('…')` call against it.
- **Other languages:** every language must contain all keys of German with the same
  placeholders (`{{name}}`, `<link>`). `src/i18n/locales.test.ts` fails otherwise.
- **New language:** copy `src/locales/en` to `src/locales/<code>`, translate the files
  and add the code with its name to `LOCALES` and `LOCALE_NAMES` in `src/shared/constants.ts` (and `Locale` in `backend/src/i18n.rs`).
- **Translation platform:** the files are set up for [Weblate](https://weblate.org)
  (format "JSON nested structure file", monolingual, template `src/locales/de/<area>.json`,
  file mask `src/locales/*/<area>.json`), so translators can work without Git.

## Commit Conventions

We follow a simple commit message format:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for code style changes (formatting, missing semi-colons, etc.)
- `refactor:` for code changes that neither fix a bug nor add a feature
- `test:` for adding missing tests or correcting existing tests
- `chore:` for updating build tasks, package manager configs, etc.

Example: `feat: add QR-code scanning to mobile view`

## Questions?

If you have any questions, feel free to open an issue or contact the maintainers.
