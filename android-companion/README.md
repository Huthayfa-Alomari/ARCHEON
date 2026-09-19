# JARVIS Android Companion v0.7

The Android phone is the Device Mesh gateway for Health Connect and Meta Wearables DAT.

## Development setup

1. Open `android-companion/` in Android Studio.
2. Use JDK 17 and install Android SDK 36.
3. For local Meta Developer Mode, the Gradle placeholders default to `0/0` and callback scheme `jarviscompanion`. For production add `MWDAT_APPLICATION_ID`, `MWDAT_CLIENT_TOKEN`, and the callback scheme registered for your app as `MWDAT_CALLBACK_SCHEME` to your Gradle user properties.
4. Start JARVIS on the PC so the phone can reach it on the LAN. The v0.7 dev manifest allows cleartext HTTP for LAN testing only; production should use TLS.
5. In JARVIS run `/pair My-Phone`, approve the pairing action, then paste the Pairing ID + 6-digit code into this app.
6. Approve the requested Device Mesh capabilities from JARVIS before commands/health ingestion can run.
7. Grant Health Connect permissions in context. Background Health sync requires the additional background-read permission.
8. Install Meta AI, enable Wearables Developer Mode, then tap **Register with Meta AI / glasses**. Grant Android Bluetooth permission when requested.
9. Before camera capture/stream commands, tap **Request Meta camera permission** and complete Meta AI's permission flow.

## Runtime

- **Live Device Mesh** is an explicit foreground service that polls every 5 seconds while a visible notification is active.
- **Health Bridge** reads only approved Health Connect types and uploads them to the desktop encrypted Health Vault.
- **Meta adapter** can start camera streaming, capture a still photo to app-private storage, and render text on display-capable glasses.
- v0.7 intentionally does **not** upload camera image/video bytes through `/api/device/commands/result`; media transport is a later hardening step.
