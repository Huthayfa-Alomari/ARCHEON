package ai.jarvis.companion

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class HealthSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        if (!MeshStore(applicationContext).paired) return Result.success()
        return try {
            HealthBridge(applicationContext).syncRecent(24)
            Result.success()
        } catch (_: SecurityException) {
            // Background Health Connect access was not granted; foreground sync remains usable.
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }
}
