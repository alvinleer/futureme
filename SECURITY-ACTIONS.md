# Manual security actions

Two things below cannot be fixed from the codebase. Everything else in the
audit has been changed in the repo; these need a human with account access.

## 1. Rotate these keys — they are compromised

They were committed to git in `mobile/eas.json` as `EXPO_PUBLIC_*`, which Expo
inlines into the JavaScript bundle. Every one of them is readable in plaintext
by anyone who has an `.ipa`, and every one is still in git history. Assume they
are public.

| Provider | Variable | Where to rotate |
|---|---|---|
| Anthropic | `EXPO_PUBLIC_VIBECODE_ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| Google / Gemini | `EXPO_PUBLIC_GEMINI`, `EXPO_PUBLIC_VIBECODE_GOOGLE_API_KEY` | Google AI Studio / Cloud console → credentials |
| ElevenLabs | `EXPO_PUBLIC_VIBECODE_ELEVENLABS_API_KEY` | elevenlabs.io → profile → API key |
| fal.ai | `EXPO_PUBLIC_FAL_AI_KEY_SECRET` | fal.ai dashboard → keys |
| FatSecret | `EXPO_PUBLIC_FATSECRET_CLIENT_SECRET` | platform.fatsecret.com → app credentials |
| Pixa | `EXPO_PUBLIC_API_PIXA` | Pixa dashboard |
| Edamam | `EXPO_PUBLIC_API_EDAMAM` | developer.edamam.com |

The new values go **only** in the backend environment (`backend/.env` /
`.env.production`, or the host's env panel) under their non-`EXPO_PUBLIC_`
names — `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`,
`FAL_AI_KEY`, `FATSECRET_CLIENT_SECRET`, `PIXA_API_KEY`, `EDAMAM_APP_KEY`.
The mobile app already routes every provider call through the backend, so it
needs none of them.

`EXPO_PUBLIC_GOOGLE_CLIENT_ID` and the App Store `ascAppId` are public
identifiers, not secrets. They stay in `eas.json`.

## 2. Scrub git history

`git rm --cached` removed these from the working tree, but they are still in
every past commit:

- `mobile/.env`, `mobile/.env.production`, `mobile/eas.json` (the keys above)
- `backend/.env`, `backend/.env.production` (`JWT_SECRET`, `ENCRYPTION_KEY`,
  and every backend provider key)
- `backend/nutrition.db`, `backend/src/nutrition.db` (real user rows)

Rotating the keys is what actually protects you; scrubbing history is cleanup.
Do the rotation first.

```sh
# Requires git-filter-repo (pip install git-filter-repo). Rewrites all commits.
git filter-repo \
  --path mobile/.env --path mobile/.env.production \
  --path backend/.env --path backend/.env.production \
  --path backend/nutrition.db --path backend/nutrition.db-shm \
  --path backend/nutrition.db-wal --path backend/src/nutrition.db \
  --invert-paths
git push --force --all
```

This changes every commit SHA. Coordinate with anyone else holding a clone —
they must re-clone, not pull.

`JWT_SECRET` and `ENCRYPTION_KEY` also need rotating, with one caveat:
changing `ENCRYPTION_KEY` makes existing encrypted columns
(`user_logs.original_input`, `weekly_visualizations.prompt_used`)
undecryptable. Changing `JWT_SECRET` just signs everyone out. With 10 testers,
rotating both and accepting the loss of old encrypted log text is the simpler
call.
