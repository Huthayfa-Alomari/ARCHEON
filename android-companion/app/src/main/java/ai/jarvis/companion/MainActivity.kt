package ai.jarvis.companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.types.Permission
import androidx.health.connect.client.permission.HealthPermission
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    private lateinit var store: MeshStore
    private lateinit var baseUrl: EditText
    private lateinit var pairingId: EditText
    private lateinit var pairingCode: EditText
    private lateinit var status: TextView
    private val health by lazy { HealthBridge(this) }

    private val healthPermissionLauncher = registerForActivityResult(healthPermissionContract()) { granted ->
        status.text = "Health permissions granted: ${granted.size}"
    }
    private val notificationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private var pendingMetaAction: String? = null
    private val bluetoothPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) {
            status.text = "Bluetooth permission is required for Meta Wearables."
            pendingMetaAction = null
            return@registerForActivityResult
        }
        val action = pendingMetaAction
        pendingMetaAction = null
        when (action) {
            "register" -> startMetaRegistration()
            "camera" -> launchMetaCameraPermission()
        }
    }
    private val metaCameraPermissionLauncher = registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
        result.onSuccess { permissionStatus ->
            status.text = "Meta camera permission: $permissionStatus"
        }.onFailure { error, _ ->
            status.text = "Meta camera permission failed: ${error.description}"
        }
    }

    private fun healthPermissionContract() = androidx.health.connect.client.PermissionController.createRequestPermissionResultContract()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = MeshStore(this)
        if (Build.VERSION.SDK_INT >= 33) notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContentView(buildUi())
        refreshStatus()
    }

    private fun buildUi(): View {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 32, 32, 48) }
        fun field(label: String, value: String = ""): EditText = EditText(this).apply { hint = label; setText(value); root.addView(this) }
        fun button(label: String, action: () -> Unit) { root.addView(Button(this).apply { text = label; setOnClickListener { action() } }) }

        root.addView(TextView(this).apply { text = "JARVIS v0.7 — Android Companion"; textSize = 22f })
        root.addView(TextView(this).apply { text = "PC ↔ Android ↔ Health Connect / Meta Wearables" })
        baseUrl = field("JARVIS PC URL (e.g. http://192.168.1.10:3000)", store.baseUrl)
        pairingId = field("Pairing ID")
        pairingCode = field("6-digit pairing code")

        button("Pair this phone") { lifecycleScope.launch { pairPhone() } }
        button("Request Health Connect permissions") { requestHealthPermissions(false) }
        button("Request background Health permission") { requestHealthPermissions(true) }
        button("Sync Health now") { lifecycleScope.launch { runHealthSync() } }
        button("Enable 15-min Health background sync") { scheduleHealthSync() }
        button("Register with Meta AI / glasses") { withMetaBluetooth("register") { startMetaRegistration() } }
        button("Request Meta camera permission") { withMetaBluetooth("camera") { launchMetaCameraPermission() } }
        button("Start Live Device Mesh") { startMeshService() }
        button("Stop Live Device Mesh") { stopService(Intent(this, MeshForegroundService::class.java)); refreshStatus() }
        button("Refresh status") { refreshStatus() }

        status = TextView(this).apply { setPadding(0, 24, 0, 0); textIsSelectable = true }
        root.addView(status)
        return ScrollView(this).apply { addView(root) }
    }

    private suspend fun pairPhone() = withContext(Dispatchers.IO) {
        try {
            store.baseUrl = baseUrl.text.toString()
            val result = MeshApi(this@MainActivity).pair(pairingId.text.toString(), pairingCode.text.toString(), Build.MODEL)
            withContext(Dispatchers.Main) { status.text = "Paired. Device ID: ${store.deviceId}\nPermission request: ${result.optJSONObject("permissionRequest")?.optString("id") ?: "none"}" }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { status.text = "Pairing failed: ${e.message}" }
        }
    }


    private fun withMetaBluetooth(action: String, block: () -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) {
            pendingMetaAction = action
            bluetoothPermissionLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
            return
        }
        block()
    }

    private fun startMetaRegistration() {
        try {
            MetaWearablesBridge(this).startRegistration(this)
            status.text = "Meta registration opened. Complete the flow in Meta AI."
        } catch (e: Exception) {
            status.text = "Meta registration failed: ${e.message}"
        }
    }

    private fun launchMetaCameraPermission() {
        try {
            MetaWearablesBridge(this).prepare()
            metaCameraPermissionLauncher.launch(Permission.CAMERA)
        } catch (e: Exception) {
            status.text = "Meta camera permission could not start: ${e.message}"
        }
    }

    private fun requestHealthPermissions(backgroundOnly: Boolean) {
        val sdk = HealthConnectClient.getSdkStatus(this)
        if (sdk != HealthConnectClient.SDK_AVAILABLE) { status.text = "Health Connect is not available on this device."; return }
        if (backgroundOnly) {
            val client = HealthConnectClient.getOrCreate(this)
            val feature = client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND)
            if (feature != HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) { status.text = "Background Health read is not supported by this Health Connect version."; return }
            healthPermissionLauncher.launch(setOf(HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND))
        } else {
            healthPermissionLauncher.launch(health.foregroundPermissions)
        }
    }

    private suspend fun runHealthSync() = withContext(Dispatchers.IO) {
        try {
            val result = health.syncRecent(24)
            withContext(Dispatchers.Main) { status.text = "Health sync: $result" }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) { status.text = "Health sync failed: ${e.message}" }
        }
    }

    private fun scheduleHealthSync() {
        val request = PeriodicWorkRequestBuilder<HealthSyncWorker>(15, TimeUnit.MINUTES).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("jarvis-health-sync", ExistingPeriodicWorkPolicy.UPDATE, request)
        status.text = "Health background worker scheduled (Android may batch execution)."
    }

    private fun startMeshService() {
        ContextCompat.startForegroundService(this, Intent(this, MeshForegroundService::class.java))
        status.text = "Live Device Mesh started."
    }

    private fun refreshStatus() {
        if (!::status.isInitialized) return
        status.text = "PC: ${store.baseUrl}\nPaired: ${store.paired}\nDevice: ${store.deviceId.ifBlank { "—" }}"
        if (store.paired) lifecycleScope.launch(Dispatchers.IO) {
            try {
                val remote = MeshApi(this@MainActivity).status()
                withContext(Dispatchers.Main) { status.text = status.text.toString() + "\nRemote: $remote" }
            } catch (_: Exception) { }
        }
    }
}
