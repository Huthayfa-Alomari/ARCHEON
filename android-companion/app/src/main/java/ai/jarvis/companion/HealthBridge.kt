package ai.jarvis.companion

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant

class HealthBridge(private val context: Context) {
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    val foregroundPermissions: Set<String> = setOf(
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    val backgroundPermission: String = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    fun permissionContract() = PermissionController.createRequestPermissionResultContract()

    suspend fun grantedPermissions(): Set<String> = client.permissionController.getGrantedPermissions()

    suspend fun syncRecent(hours: Long = 24): JSONObject {
        val granted = grantedPermissions()
        val start = Instant.now().minus(Duration.ofHours(hours.coerceIn(1, 168)))
        val end = Instant.now()
        val filter = TimeRangeFilter.between(start, end)
        val samples = JSONArray()

        if (HealthPermission.getReadPermission(HeartRateRecord::class) in granted) {
            client.readRecords(ReadRecordsRequest<HeartRateRecord>(timeRangeFilter = filter)).records.forEach { record ->
                record.samples.forEach { point ->
                    samples.put(sample("heart_rate", point.time, null, point.beatsPerMinute.toDouble(), "bpm", record.metadata.dataOrigin.packageName))
                }
            }
        }
        if (HealthPermission.getReadPermission(BloodPressureRecord::class) in granted) {
            client.readRecords(ReadRecordsRequest<BloodPressureRecord>(timeRangeFilter = filter)).records.forEach { record ->
                samples.put(sample(
                    "blood_pressure", record.time, null,
                    JSONObject().put("systolic", record.systolic.inMillimetersOfMercury).put("diastolic", record.diastolic.inMillimetersOfMercury),
                    "mmHg", record.metadata.dataOrigin.packageName
                ))
            }
        }
        if (HealthPermission.getReadPermission(OxygenSaturationRecord::class) in granted) {
            client.readRecords(ReadRecordsRequest<OxygenSaturationRecord>(timeRangeFilter = filter)).records.forEach { record ->
                samples.put(sample("oxygen_saturation", record.time, null, record.percentage.value, "%", record.metadata.dataOrigin.packageName))
            }
        }
        if (HealthPermission.getReadPermission(StepsRecord::class) in granted) {
            client.readRecords(ReadRecordsRequest<StepsRecord>(timeRangeFilter = filter)).records.forEach { record ->
                samples.put(sample("steps", record.startTime, record.endTime, record.count.toDouble(), "steps", record.metadata.dataOrigin.packageName))
            }
        }
        if (HealthPermission.getReadPermission(SleepSessionRecord::class) in granted) {
            client.readRecords(ReadRecordsRequest<SleepSessionRecord>(timeRangeFilter = filter)).records.forEach { record ->
                val minutes = Duration.between(record.startTime, record.endTime).toMinutes().toDouble()
                samples.put(sample("sleep", record.startTime, record.endTime, JSONObject().put("minutes", minutes), "minutes", record.metadata.dataOrigin.packageName))
            }
        }

        val uploaded = if (samples.length() > 0) MeshApi(context).ingestHealth(samples) else JSONObject().put("ok", true).put("accepted", 0)
        return JSONObject().put("collected", samples.length()).put("upload", uploaded)
    }

    private fun sample(type: String, start: Instant, end: Instant?, value: Any, unit: String, source: String): JSONObject {
        return JSONObject().put("type", type).put("startTime", start.toString()).apply {
            if (end != null) put("endTime", end.toString())
            put("value", value).put("unit", unit).put("source", source)
        }
    }
}
