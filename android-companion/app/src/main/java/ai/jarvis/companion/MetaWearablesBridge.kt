package ai.jarvis.companion

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.display.Display
import com.meta.wearable.dat.display.addDisplay
import com.meta.wearable.dat.display.removeDisplay
import com.meta.wearable.dat.display.types.DisplayState
import com.meta.wearable.dat.display.views.FlexBoxBackground
import com.meta.wearable.dat.display.views.TextStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.io.File

class MetaWearablesBridge(private val context: Context) {
    private var session: DeviceSession? = null
    private var camera: Camera? = null
    private var display: Display? = null

    companion object {
        @Volatile private var initialized = false
        private val initLock = Any()
    }

    fun prepare() = ensureInitialized()

    fun startRegistration(activity: Activity) {
        ensureInitialized()
        Wearables.startRegistration(activity)
    }

    private fun ensureInitialized() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            throw SecurityException("Bluetooth permission is required before Meta Wearables DAT can start")
        }
        if (initialized) return
        synchronized(initLock) {
            if (initialized) return
            Wearables.initialize(context.applicationContext).getOrElse { error ->
                throw IllegalStateException("Meta DAT initialization failed: ${error.description}")
            }
            initialized = true
        }
    }

    private suspend fun ensureSession(): DeviceSession {
        ensureInitialized()
        session?.let { existing ->
            if (existing.state.value == DeviceSessionState.STARTED) return existing
            if (existing.state.value != DeviceSessionState.STOPPED) {
                existing.state.first { it == DeviceSessionState.STARTED || it == DeviceSessionState.STOPPED }
                if (existing.state.value == DeviceSessionState.STARTED) return existing
            }
            session = null
        }

        val created = Wearables.createSession(AutoDeviceSelector()).getOrElse { error ->
            throw IllegalStateException("Meta session failed: ${error.description}")
        }
        created.start()
        created.state.first { it == DeviceSessionState.STARTED || it == DeviceSessionState.STOPPED }
        if (created.state.value != DeviceSessionState.STARTED) {
            throw IllegalStateException("Meta session stopped before becoming ready")
        }
        session = created
        return created
    }

    private suspend fun requireCameraPermission() {
        ensureInitialized()
        val status = Wearables.checkPermissionStatus(Permission.CAMERA).getOrElse { error ->
            throw IllegalStateException("Meta camera permission check failed: ${error.description}")
        }
        if (status != PermissionStatus.Granted) {
            throw SecurityException("Meta camera permission is not granted. Request it from JARVIS Companion first.")
        }
    }

    private suspend fun ensureCamera(quality: String = "medium"): Camera {
        requireCameraPermission()
        camera?.let { return it }
        val videoQuality = when (quality.lowercase()) {
            "low" -> VideoQuality.LOW
            "high" -> VideoQuality.HIGH
            else -> VideoQuality.MEDIUM
        }
        val attached = ensureSession().addCamera(
            StreamConfiguration(videoQuality = videoQuality, frameRate = 15)
        ).getOrElse { error ->
            throw IllegalStateException("Meta camera failed: ${error.description}")
        }
        attached.stream.start().getOrElse { error ->
            throw IllegalStateException("Meta stream failed: ${error.description}")
        }
        camera = attached
        return attached
    }

    suspend fun startStream(quality: String): String {
        ensureCamera(quality)
        return "streaming"
    }

    suspend fun stopStream(): String {
        camera?.stop()
        camera = null
        return "stopped"
    }

    suspend fun capturePhoto(): File {
        val photo = ensureCamera().stream.capturePhoto().getOrElse { error ->
            throw IllegalStateException("Meta capture failed: ${error.description}")
        }
        val dir = File(context.filesDir, "meta-captures").apply { mkdirs() }
        val file = File(dir, "meta_${System.currentTimeMillis()}.jpg")
        withContext(Dispatchers.IO) { file.writeBytes(photo.data) }
        return file
    }

    suspend fun renderText(text: String): String {
        ensureInitialized()
        val s = ensureSession()
        var current = display
        if (current == null) {
            current = s.addDisplay().getOrElse { error ->
                throw IllegalStateException("Meta display failed: ${error.description}")
            }
            current.state.first { it == DisplayState.STARTED || it == DisplayState.STOPPED }
            if (current.state.value != DisplayState.STARTED) {
                throw IllegalStateException("Meta display stopped before becoming ready")
            }
            display = current
        }
        current.sendContent {
            flexBox(gap = 12, padding = 24, background = FlexBoxBackground.CARD) {
                text(text.take(4000), style = TextStyle.BODY)
            }
        }.getOrElse { error ->
            throw IllegalStateException("Meta display render failed: ${error.description}")
        }
        return "rendered"
    }

    suspend fun shutdown() {
        session?.removeDisplay()
        display = null
        camera?.stop()
        camera = null
        session?.stop()
        session = null
    }
}
