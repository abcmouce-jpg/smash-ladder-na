# Smash Ladder NA

**Live at [smash-ladder-na.vercel.app](https://smash-ladder-na.vercel.app/) · Community: [Discord](https://discord.gg/zE8B44vQxf)**

A ranked ladder site for the NA *Super Smash Bros. Ultimate* community. Players sign in with
Discord, get matched 1v1 through a lobby queue, self-report best-of-3 results, and climb a
seasonal rating. The site also supports casual free-battle matchmaking, community tournaments
(bracket hosted on [start.gg](https://www.start.gg), with live entrant/standing data pulled
in automatically), character leaderboards, and moderation tooling for disputes and conduct
reports.

Independent from — and not affiliated with — Japan's Smashmate or other existing Smash
matchmaking platforms; this is an unrelated, separately-run project built for the NA scene.

## Why this exists

There are existing closed-source matchmaking platforms for Smash in NA. This project's angle is
being open-source: the community can inspect, contribute to, and shape the platform directly,
and the moderation policies that govern ranked play are transparent rather than a black box.

## Features

- **Ranked ladder** — lobby-based matchmaking, best-of-3 stage striking, self-reported results
  with a dispute flow when reports disagree, and Elo-style rating per season.
- **Free battle** — casual matchmaking outside the ranked ladder.
- **Tournaments** — community-hosted brackets linked to start.gg; entrant count and final
  standings are fetched live from the start.gg API once configured.
- **Character leaderboards** — full *Ultimate* roster (including all DLC).
- **Discord integration** — sign-in via Discord OAuth, plus optional DM notifications through a
  Discord bot.
- **Moderation** — conduct reports with threshold-based suspend/ban actions, and a disputed-game
  resolution queue for admins/mods.
- **Region-aware matchmaking**, with an optional launch-region lock for a staged rollout.

## Tech stack

Next.js (App Router) · React · TypeScript · Prisma + PostgreSQL · Auth.js (NextAuth) with
Discord OAuth · Tailwind CSS + shadcn/ui · Sentry.

## Getting started

No external accounts needed — Docker handles the database and a built-in dev login replaces
Discord OAuth.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start a local Postgres database:

   ```bash
   docker compose up -d
   ```

3. Run migrations:

   ```bash
   npx prisma migrate dev
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) — click "Sign in" and enter any username.

The checked-in `.env.development` file has everything pre-configured for this local setup. If
you want to use a remote database or real Discord OAuth instead, copy `.env.example` to `.env`
and fill in the values.

## Testing

Run the unit tests with:

```bash
npm test
```

Use `npm run test:watch` for watch mode during development. Tests live alongside the source
files they cover (`src/lib/*.test.ts`) and run in CI on every push and pull request.

## Contributing

Bug reports, feature requests, and pull requests are welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md) for how to get set up and what to include. Please also
read the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Community & moderation

Join the [Discord server](https://discord.gg/zE8B44vQxf) to hang out, report issues, or reach a
mod/admin (e.g. for a ban appeal). Moderation is currently staffed by around 5 people, selected
on a volunteer basis — reach out in Discord if you're interested in helping out.

## License

[MIT](./LICENSE)
