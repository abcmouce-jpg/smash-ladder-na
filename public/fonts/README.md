# Fonts for the link-preview image

`next/og` ships one font, Geist, which has no Japanese glyphs — so Japanese
text in `opengraph-image.tsx` would render as blank boxes. These two files are
Noto Sans JP subsetted to **exactly** the characters that image draws, which
is why 15 KB covers it instead of the several megabytes a full CJK face
costs. (`ImageResponse` allows 500 KB for the whole bundle: JSX, CSS, fonts
and images together.)

They are only read when the instance publishes Japanese, and only by the
image route — nothing else on the site uses them.

## Regenerating

Change the image's wording and these go stale: a character the subset doesn't
carry renders as a blank box. Rebuild them from the exact strings the image
draws (Google Fonts serves TrueType rather than woff2 to an old user agent,
and `next/og` takes ttf/otf/woff, not woff2):

```sh
TEXT=$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote("".join(sorted(set(sys.argv[1])))))' \
  'SMASH LADDER JP日本のスマブラSPのレート対戦ラダー無料 · Discord でログイン · すぐ対戦')
for W in 400 700; do
  URL=$(curl -s -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@$W&text=$TEXT" \
    | grep -oE 'https://fonts.gstatic.com/[^)]*')
  curl -s "$URL" -o "public/fonts/noto-sans-jp-og-$W.ttf"
done
```

## Licence

Noto Sans JP, SIL Open Font License 1.1 — see `OFL.txt`, which ships beside
the fonts because the licence requires it.
