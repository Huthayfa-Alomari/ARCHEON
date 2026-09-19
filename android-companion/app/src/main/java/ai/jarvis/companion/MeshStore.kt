package ai.jarvis.companion

import android.content.Context

class MeshStore(context: Context) {
    private val prefs = context.getSharedPreferences("jarvis_mesh", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString("base_url", "http://192.168.1.2:3000") ?: ""
        set(value) = prefs.edit().putString("base_url", value.trim().trimEnd('/')).apply()

    var token: String
        get() = prefs.getString("token", "") ?: ""
        set(value) = prefs.edit().putString("token", value).apply()

    var deviceId: String
        get() = prefs.getString("device_id", "") ?: ""
        set(value) = prefs.edit().putString("device_id", value).apply()

    val paired: Boolean get() = token.isNotBlank() && deviceId.isNotBlank() && baseUrl.isNotBlank()

    fun clearPairing() {
        prefs.edit().remove("token").remove("device_id").apply()
    }
}
