package ai.jarvis.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class CommandProcessor(private val context: Context) {
    private val meta = MetaWearablesBridge(context)

    suspend fun execute(command: JSONObject): JSONObject = withContext(Dispatchers.Default) {
        val type = command.getString("type")
        val payload = command.optJSONObject("payload") ?: JSONObject()
        when (type) {
            "device.notification" -> {
                notify(payload.optString("title", "JARVIS"), payload.optString("body", ""))
                JSONObject().put("shown", true)
            }
            "device.vibrate" -> {
                vibrate(payload.optLong("ms", 300).coerceIn(50, 2000))
                JSONObject().put("vibrated", true)
            }
            "meta.camera.capture" -> {
                val file = meta.capturePhoto()
                JSONObject().put("storedLocally", true).put("bytes", file.length()).put("localFile", file.name)
            }
            "meta.camera.stream.start" -> JSONObject().put("state", meta.startStream(payload.optString("quality", "medium")))
            "meta.camera.stream.stop" -> JSONObject().put("state", meta.stopStream())
            "meta.display.render" -> JSONObject().put("state", meta.renderText(payload.optString("text", "JARVIS")))
            else -> throw IllegalArgumentException("Unsupported mesh command: $type")
        }
    }

    private fun notify(title: String, body: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val channelId = "jarvis_commands"
        manager.createNotificationChannel(NotificationChannel(channelId, "JARVIS Commands", NotificationManager.IMPORTANCE_DEFAULT))
        manager.notify(
            (System.currentTimeMillis() and 0x7fffffff).toInt(),
            NotificationCompat.Builder(context, channelId).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).build()
        )
    }

    private fun vibrate(ms: Long) {
        val vibrator = context.getSystemService(Vibrator::class.java)
        vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}
