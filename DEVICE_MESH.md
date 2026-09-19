# Device Mesh Operations Guide — v0.7

## State files

```text
data/device-mesh.json          paired devices / command queue
data/device-permissions.json   Permission Broker state
data/.device-mesh.key          local mesh secret when env secret is omitted
data/health-vault.jsonl        AES-GCM encrypted Health samples
```

All of these files are ignored by Git.

## Pairing protocol

```text
Desktop owner                 Android Companion
     |                               |
     | device.pair.start             |
     |-- pairingId + 6-digit code -->|
     |                               |
     |                 POST /api/device/pair/complete
     |<----- pairingId/code/capabilities ----------|
     | validate HMAC/expiry/attempts   |
     | issue random token               |
     |------- deviceId + token -------->|
     |                               |
     |              Bearer token on subsequent calls
```

Only `mesh.heartbeat` is automatically granted. Requested capabilities become requests that the owner can approve later.

## Command protocol

```text
JARVIS action
  -> Approval Gateway
  -> Permission Broker grant check
  -> queue command
  -> Android authenticated poll
  -> claim command
  -> execute locally
  -> bounded JSON result
  -> complete / failed state
```

The command-result route is deliberately not a generic file-upload channel.

## Recommended first test

1. Start desktop with `npm run dev:lan`.
2. Pair the Android app.
3. Verify `/devices` shows the phone online.
4. Grant `device.notifications.push`.
5. Send a notification and confirm it appears on Android.
6. Grant one Health capability, for example `health.heart_rate.read`.
7. Grant the matching Health Connect permission on Android.
8. Tap **Sync Health Now**.
9. Query `/health heart_rate` and confirm a sample appears.
10. Revoke that Health capability and verify another ingest is rejected.

## BrowserSkill first test

1. Install BrowserSkill CLI/extension and verify `bsk status --json` works.
2. Run `/browser authorize` and approve the requested JARVIS broker grants.
3. Start a BrowserSkill session.
4. Navigate/observe a disposable test page.
5. Test existing-user-tab borrowing only after confirming BrowserSkill still prompts according to its own settings.

## Meta first test

1. Pair the glasses through Meta AI.
2. Enable Wearables Developer Mode.
3. Register JARVIS Companion with Meta AI.
4. Grant `meta.display.render` first and test harmless display text.
5. Grant camera capabilities only when needed.
6. Verify captured-photo bytes remain in Android app-private storage.

## Failure isolation

A failure in one adapter should not grant fallback authority through another adapter. Examples:

- Health permission denied -> do not scrape vendor apps/UI as a workaround.
- BrowserSkill borrow denied -> do not bypass it with cookie/session extraction.
- Meta registration denied -> do not attempt undocumented Bluetooth control.
- Missing broker grant -> command must not be queued even if the device advertised the capability.
