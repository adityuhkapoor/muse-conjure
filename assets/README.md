`bun run check` (in `assets/`: `bun selftest.ts`)

# assets

Real pictures only. The team members' own profile photos (`people/`, used with their permission), the owner's own
photos, and free photos from Unsplash and Pexels in `img/photo/`, each credited in `CREDITS.md` (id, source, photo
page, photographer, licence, date). Nothing in the manifest is AI-generated: the old generated portraits, candids,
posts, reels, stories, covers and object photos stay in `img/` for history only, are not in the manifest, and are
never loaded or exported. Made-up people are drawn faces (`apps/shell/src/lib/face.ts`); a missing or failed photo
falls back to a drawn cover (`cover.ts`).

Add or change a photo: put the source in `.cache/photos/` (git-ignored; owner photos stay in `people/src/feed/`),
add a row to `scripts/assets/photos.json` (crop ratio, focus, alt text, credit), run `bun scripts/assets/photos.ts`.
It writes the WebP sizes, placeholder and colour into the manifest and rewrites `CREDITS.md`.

Check: `bun assets/selftest.ts` (missing file, over-budget image, cast member without a portrait or avatar size, a
mapping to nothing, a photo with no credit row; every fixture in `fixtures/` must fail it).

- `manifest.json`: per asset id, kind (`photo` or `portrait`), who, alt, sizes, dominant color and 16 px
  placeholder, plus a `map` with `people`, `places`, `listings`, `photos` and `gallery`.
- `index.ts`: `avatarFor(personId, size)`, `photo(id, width)` and the lookups the shell uses. Falls back to an
  initials descriptor when a person has no image.
- `img/photo/`: the real photos, WebP at two widths each (`photos.ts` keeps each under the self-test budget).
  `people/`: the five team members' avatars at 96 and 256 px (Aditya also has 512 px, used by the Create story tile).
- `CREDITS.md`: where every photo came from.
- `fixtures/`: one broken case per self-test rule; every fixture must fail the self-test.
- `corpus/phrasebank.json`: a sample of chat phrasing kept for reference. Nothing in the demo reads it.
