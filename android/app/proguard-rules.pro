# Capacitor ProGuard Rules
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class org.apache.cordova.** { *; }

# Keep the BridgeActivity and plugin interfaces
-keep class in.kwen.app.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod public <methods>;
}

# Keep JavaScript interfaces for WebView
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Supabase / OkHttp
-keep class io.supabase.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Keep annotations
-keepattributes *Annotation*
-keepattributes Signature
