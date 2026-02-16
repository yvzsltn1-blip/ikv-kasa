# Performance Notes

## Startup Baseline
- The app startup target is about `~1s` after auth state is resolved.
- Firestore is initialized with forced long polling in `firebase.ts` for unstable proxy/network environments.

## Implemented Startup Optimizations
- Parallelized initial critical reads in `App.tsx` (`admin` + `users/{uid}`).
- Moved non-critical metadata reads to background load (does not block initial screen render).
- Removed startup-blocking `await` on migration writeback.
- Removed React `StrictMode` wrapper in `index.tsx` to avoid double-mount boot cost in dev.

## Telemetry
- Boot telemetry is logged from `App.tsx` with tag:
  - `[PERF][BOOT][<uid-prefix>]`
- Step logs include:
  - incremental step time (`+Xms`)
  - cumulative total (`total Yms`)

## Regression Check
1. Open DevTools Console.
2. Reload the app (`Ctrl+F5`).
3. Check `[PERF][BOOT]` sequence and find the largest step.
4. If startup regresses, optimize the largest step first.

