package com.ngigi.wallet.settings

import android.content.Context

class Prefs(context: Context) {
    private val sp = context.getSharedPreferences("wallet_prefs", Context.MODE_PRIVATE)

    var baseUrl: String?
        get() = sp.getString("base_url", null)
        set(v) { sp.edit().putString("base_url", v?.trimEnd('/')).apply() }

    var apiToken: String?
        get() = sp.getString("api_token", null)
        set(v) { sp.edit().putString("api_token", v).apply() }

    val isConfigured: Boolean get() = !baseUrl.isNullOrBlank() && !apiToken.isNullOrBlank()
}
