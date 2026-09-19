plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.jarvis.companion"
    compileSdk = 36

    defaultConfig {
        applicationId = "ai.jarvis.companion"
        minSdk = 29
        targetSdk = 36
        versionCode = 7
        versionName = "0.7.0"
        manifestPlaceholders["mwdat_application_id"] = project.findProperty("MWDAT_APPLICATION_ID")?.toString() ?: "0"
        manifestPlaceholders["mwdat_client_token"] = project.findProperty("MWDAT_CLIENT_TOKEN")?.toString() ?: "0"
        manifestPlaceholders["mwdat_callback_scheme"] = project.findProperty("MWDAT_CALLBACK_SCHEME")?.toString() ?: "jarviscompanion"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.12.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.10.0")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    implementation("com.meta.wearable:mwdat-core:0.9.0")
    implementation("com.meta.wearable:mwdat-camera:0.9.0")
    implementation("com.meta.wearable:mwdat-display:0.9.0")
    debugImplementation("com.meta.wearable:mwdat-mockdevice:0.9.0")
}
