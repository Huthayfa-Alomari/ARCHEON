package ai.jarvis.companion

import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 56)
        }
        root.addView(TextView(this).apply {
            text = "JARVIS Health Connect privacy"
            textSize = 22f
        })
        root.addView(TextView(this).apply {
            text = getString(R.string.health_rationale)
            textSize = 16f
            setPadding(0, 24, 0, 0)
        })
        root.addView(TextView(this).apply {
            text = "Data types: heart rate, blood pressure, oxygen saturation, steps, and sleep. Access remains controlled by Android Health Connect permissions and the JARVIS Permission Broker. You can revoke either permission layer at any time."
            textSize = 15f
            setPadding(0, 20, 0, 0)
        })

        setContentView(ScrollView(this).apply { addView(root) })
    }
}
