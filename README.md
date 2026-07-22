# Smash Ladder NA

A ranked ladder site for the NA *Super Smash Bros. Ultimate* community. Players sign in with
Discord, get matched 1v1 through a lobby queue, self-report best-of-3 results, and climb a
seasonal rating. The site also supports casual free-battle matchmaking, community tournaments
(bracket hosted on [start.gg](https://www.start.gg), with live entrant/standing data pulled
in automatically), character leaderboards, and moderation tooling for disputes and conduct
reports.

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

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values — each variable is documented inline,
   including which ones are optional and what happens when they're left unset.

3. Set up the database:

   ```bash
   npx prisma migrate dev
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

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

## License

[MIT](./LICENSE)
