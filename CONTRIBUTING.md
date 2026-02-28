# Contributing

Thanks for contributing to Chrome Activity Reader.

## Development Setup

1. Install Node.js 22+
2. Install dependencies:
   - `npm install`
3. Install Playwright browser:
   - `npx playwright install chromium`

## Run Tests

- `npm run test:all`
- `npm run test:smoke:extension`
- `npm run test:flows:extension`

## Pull Request Guidelines

1. Keep changes focused and small.
2. Add or update tests for behavior changes.
3. Update docs when user-facing behavior changes.
4. Ensure all tests pass before opening PR.

## Commit Message Style

Use clear imperative messages, for example:

- `Fix side panel state sync after close`
- `Add install guide for unpacked Chrome extension`
