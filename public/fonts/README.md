# Fonts for the link-preview image

`next/og` ships one font, Geist, which has no Japanese glyphs — so Japanese
text in `opengraph-image.tsx` would render as blank boxes. These file is
Zen Kaku Gothic New subsetted to **exactly** the characters that image draws, which
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
  'スマブラレート対戦')
URL=$(curl -s -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@900&text=$TEXT" \
  | grep -oE 'https://fonts.gstatic.com/[^)]*')
curl -s "$URL" -o public/fonts/zen-kaku-gothic-new-og-900.ttf
```

Kana and kanji only, deliberately: include `S` or `P` and the wordmark gets
drawn half in this face and half in the bundled one, because Satori picks the
first supplied font that carries a glyph.

## Licence

Zen Kaku Gothic New, SIL Open Font License 1.1 — see `OFL.txt`, which ships beside
the fonts because the licence requires it.
