# Contributing

Thanks for taking the time to contribute!

## Getting set up

Follow the "Getting started" section in [README.md](./README.md) to get a local dev environment
running. You'll need your own Discord OAuth application and a Postgres database (e.g. a free
[Neon](https://neon.tech) project) — `.env.example` explains every variable, including which
ones are optional.

## Reporting bugs

Open an issue with:

- What you expected to happen vs. what actually happened
- Steps to reproduce
- Your browser/OS if it looks environment-specific

## Proposing features

Open an issue describing the problem you're trying to solve before writing code for anything
non-trivial — it's much easier to discuss approach before a PR than after. Small fixes (typos,
obvious bugs) can just go straight to a PR.

## Pull requests

- Keep PRs focused on one change; unrelated cleanup makes review harder.
- Run `npm run lint` and `npx tsc --noEmit` before opening the PR — CI runs both.
- Describe *why* the change is needed, not just what it does.
- Ranked-play rule changes (stage lists, reporting flow, moderation thresholds) affect real
  players' matches — flag these clearly in the PR description so they get extra scrutiny.

## Code of Conduct

This project follows the [Code of Conduct](./CODE_OF_CONDUCT.md). Please read it before
participating.
