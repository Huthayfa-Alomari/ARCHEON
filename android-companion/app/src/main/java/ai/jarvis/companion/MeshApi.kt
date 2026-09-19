package ai.jarvis.companion

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL

class MeshApi(context: Context) {
    private val store = MeshStore(context)

    data class HttpResult(val code: Int, val body: JSONObject) {
        val ok: Boolean get() = code in 200..299 && body.optBoolean("ok", true)
        fun requireOk(): JSONObject {
            if (!ok) throw IllegalStateException(body.optString("error", "HTTP $code"))
            return body
        }
    }

    private fun connection(path: String, method: String, authenticated: Boolean): HttpURLConnection {
        if (store.baseUrl.isBlank()) error("JARVIS base URL is empty")
        val conn = URL(store.baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 7_000
        conn.readTimeout = 20_000
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Accept", "application/json")
        if (authenticated) {
            if (store.token.isBlank()) error("Device is not paired")
            conn.setRequestProperty("Authorization", "Bearer ${store.token}")
        }
        return conn
    }

    private fun request(path: String, method: String = "POST", payload: JSONObject? = null, authenticated: Boolean = true): HttpResult {
        val conn = connection(path, method, authenticated)
        if (payload != null) {
            conn.doOutput = true
            conn.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(payload.toString()) }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        val body = try { if (text.isBlank()) JSONObject() else JSONObject(text) } catch (_: Exception) { JSONObject().put("raw", text) }
        conn.disconnect()
        return HttpResult(code, body)
    }

    fun pair(pairingId: String, code: String, deviceName: String): JSONObject {
        val advertised = capabilities()
        val requested = JSONArray().apply {
            listOf(
                "device.notifications.push", "device.vibrate",
                "health.heart_rate.read", "health.blood_pressure.read", "health.oxygen_saturation.read", "health.steps.read", "health.sleep.read",
                "meta.camera.capture", "meta.camera.stream", "meta.display.render"
            ).forEach(::put)
        }
        val payload = JSONObject()
            .put("pairingId", pairingId.trim())
            .put("code", code.trim())
            .put("name", deviceName.trim().ifBlank { Build.MODEL })
            .put("kind", "android")
            .put("platform", "Android ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT}")
            .put("appVersion", BuildConfig.VERSION_NAME)
            .put("capabilities", advertised)
            .put("requestedCapabilities", requested)
            .put("metadata", JSONObject().put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL))
        val result = request("/api/device/pair/complete", payload = payload, authenticated = false).requireOk()
        store.token = result.getString("token")
        store.deviceId = result.getJSONObject("device").getString("id")
        return result
    }

    fun heartbeat(): JSONObject = request(
        "/api/device/heartbeat",
        payload = JSONObject().put("capabilities", capabilities()).put("metadata", JSONObject().put("batteryGateway", "android"))
    ).requireOk()

    fun status(): JSONObject = request("/api/device/status", method = "GET", payload = null).requireOk()

    fun pollCommands(limit: Int = 10): JSONArray = request(
        "/api/device/commands/poll", payload = JSONObject().put("limit", limit.coerceIn(1, 20))
    ).requireOk().optJSONArray("commands") ?: JSONArray()

    fun completeCommand(commandId: String, ok: Boolean, result: JSONObject? = null, error: String? = null): JSONObject {
        val payload = JSONObject().put("commandId", commandId).put("ok", ok)
        if (result != null) payload.put("result", result)
        if (!error.isNullOrBlank()) payload.put("error", error.take(1000))
        return request("/api/device/commands/result", payload = payload).requireOk()
    }

    fun ingestHealth(samples: JSONArray): JSONObject = request(
        "/api/device/health/ingest", payload = JSONObject().put("samples", samples)
    ).requireOk()

    fun requestPermissions(capabilities: List<String>, reason: String): JSONObject {
        return request("/api/device/permissions/request", payload = JSONObject().put("capabilities", JSONArray(capabilities)).put("reason", reason)).requireOk()
    }

    private fun capabilities() = JSONArray().apply {
        listOf(
            "mesh.heartbeat", "device.notifications.push", "device.vibrate",
            "health.heart_rate.read", "health.blood_pressure.read", "health.oxygen_saturation.read", "health.steps.read", "health.sleep.read",
            "meta.camera.capture", "meta.camera.stream", "meta.display.render"
        ).forEach(::put)
    }
}
