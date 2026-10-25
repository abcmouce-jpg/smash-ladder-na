import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // These are root-anchored, so build output inside a nested git worktree
    // (.claude/worktrees/*) slips past the patterns above and gets linted as
    // if it were source. One stale worktree's .next turned `npm run lint`
    // into 920 errors in generated chunks.
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
