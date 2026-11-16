# Version compatibility matrix (versions actually installed and run)

| Component | Version | Notes |
|---|---|---|
| Node.js | 22 LTS (tested 22.23.4; `engines >=22.13`) | EAS builds pinned to 22.13.0 in `eas.json` |
| PostgreSQL | 16 (tested 16.15) | `docker-compose.yml` uses `postgres:16-alpine` |
| Express / pg / zod | 5.3.0 / 8.23.1 / 4.6.7 | |
| Expo SDK | 58 (`expo` 58.0.25) | `latest` on npm when this was built; verify Expo Go on your phone supports SDK 58 |
| React Native / React | 0.88.1 / 19.3.0 | New Architecture |
| Reanimated / worklets | 4.7.1 / 0.13.x | |
| TypeScript | 5.9 | strict |
| EAS CLI | `>= 16` (use `npx eas-cli@latest`) | |
| Windows | 10/11 | dev only; iOS is built in Expo's cloud, no Mac needed |

Run `npx expo install --check` inside `mobile/` after any SDK bump to see mismatches.
