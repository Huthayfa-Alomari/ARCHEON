package ai.jarvis.companion

import android.app.Application

/**
 * Reserved for app-wide JARVIS initialization.
 *
 * Meta Wearables DAT is intentionally initialized lazily by MetaWearablesBridge
 * after Android Bluetooth permission is available, rather than at process start.
 */
class JarvisApplication : Application()
