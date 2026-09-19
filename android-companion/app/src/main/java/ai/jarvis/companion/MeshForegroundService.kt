package ai.jarvis.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class MeshForegroundService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "JARVIS Device Mesh", NotificationManager.IMPORTANCE_LOW))
        startForeground(
            7007,
            NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentTitle("JARVIS Device Mesh")
                .setContentText("Live command bridge is active")
                .setOngoing(true)
                .build()
        )
        loop = scope.launch { runLoop() }
    }

    private suspend fun runLoop() {
        val api = MeshApi(this)
        val processor = CommandProcessor(this)
        while (scope.isActive) {
            try {
                if (MeshStore(this).paired) {
                    api.heartbeat()
                    val commands = api.pollCommands(10)
                    for (i in 0 until commands.length()) {
                        val command = commands.getJSONObject(i)
                        val id = command.getString("id")
                        try {
                            val result = processor.execute(command)
                            api.completeCommand(id, true, result)
                        } catch (e: Exception) {
                            api.completeCommand(id, false, null, e.message ?: e.javaClass.simpleName)
                        }
                    }
                }
            } catch (_: Exception) {
                // Transient LAN/server errors are retried; foreground notification remains visible.
            }
            delay(5_000)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onDestroy() { loop?.cancel(); scope.cancel(); super.onDestroy() }

    companion object { const val CHANNEL = "jarvis_mesh" }
}
