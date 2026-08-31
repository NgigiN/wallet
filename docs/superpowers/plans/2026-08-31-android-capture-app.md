# Android Capture App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native Android app that intercepts M-PESA/Airtel Money SMS, prompts for a category via heads-up notification, stores locally in Room, and syncs to the Go backend.

**Architecture:** Manifest-registered `SmsReceiver` → `SmsParser` (pure Kotlin) → Room row (`UNTAGGED`) → heads-up notification with category actions → `TAGGED` → `SyncWorker` POSTs to the backend and marks `SYNCED`. The Room DB is also a full local replica powering an offline Stats screen; an untagged Inbox is the home screen safety net. Transfers (Pochi moves) auto-tag with no prompt.

**Tech Stack:** Kotlin 2.1.0, AGP 8.7.3, Gradle 8.9, JDK 17 (installed), compileSdk/targetSdk 35, minSdk 26, Jetpack Compose (BOM 2024.12.01, Material3), Room 2.6.1 (KSP), WorkManager 2.10.0, OkHttp 4.12.0 + kotlinx-serialization 1.7.3, JUnit4 + Robolectric 4.14.1 + MockWebServer.

**Spec:** `docs/superpowers/specs/2026-08-31-sms-finance-tracker-design.md`

## Global Constraints

- Project lives in `android/` inside this repo; package `com.ngigi.wallet`; app label "Wallet".
- Android SDK: `/home/ngigi/Android/Sdk` (platforms android-34/35/36 installed; `local.properties` points here and is git-ignored).
- All Gradle commands run from `android/` via the wrapper: `./gradlew`.
- Monitored senders, compared case-insensitively: `mpesa`, `airtelmoney`.
- Direction strings: `in` | `out` | `transfer`. Source strings: `mpesa` | `airtel`. Status strings: `UNTAGGED` | `TAGGED` | `SYNCED` | `PARSE_FAILED`.
- Categories v1 (hardcoded): food, travel, savings, church, investments, income; plus the reserved auto-category `transfer`.
- API wire format (must match the backend's `TransactionJSON` exactly): `transaction_id`, `amount`, `direction`, `source`, `counterparty`, `date_time` (RFC3339 with offset), `balance`, `cost`, `category`, `reason`. Auth: `Authorization: Bearer <token>`. POST 201=created, 200=duplicate, both mean synced.
- Test fixtures are ANONYMIZED copies of real SMS (structure/spacing verbatim, names/phones/amounts replaced). Never commit raw dumps — the repo is public.
- Unit tests: `./gradlew :app:testDebugUnitTest`. Robolectric tests annotate `@Config(sdk = [34])`.
- Commit after every task; messages in plain conventional style, **no AI attribution of any kind**.

---

### Task 1: Project scaffold

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/local.properties`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt`
- Create: Gradle wrapper (`android/gradlew`, `android/gradle/wrapper/*`)
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: buildable app skeleton; every later task adds to `app/src/main/java/com/ngigi/wallet/` and builds with `./gradlew :app:assembleDebug`.

- [ ] **Step 1: Create the Gradle files**

`android/settings.gradle.kts`:

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "wallet-android"
include(":app")
```

`android/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.0" apply false
    id("com.google.devtools.ksp") version "2.1.0-1.0.29" apply false
}
```

`android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx2g
android.useAndroidX=true
```

`android/local.properties`:

```properties
sdk.dir=/home/ngigi/Android/Sdk
```

`android/app/build.gradle.kts`:

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.devtools.ksp")
}

android {
    namespace = "com.ngigi.wallet"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.ngigi.wallet"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    testOptions { unitTests { isIncludeAndroidResources = true } }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.14.1")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
}
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.RECEIVE_SMS" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:label="Wallet"
        android:icon="@android:drawable/sym_def_app_icon"
        android:theme="@android:style/Theme.Material.NoActionBar">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`android/app/src/main/java/com/ngigi/wallet/MainActivity.kt` (placeholder, replaced in Task 8):

```kotlin
package com.ngigi.wallet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Text("Wallet") }
    }
}
```

- [ ] **Step 2: Generate the Gradle wrapper**

No system gradle is installed; use mise (already on this machine):

```bash
cd android
mise exec gradle@8.9 -- gradle wrapper --gradle-version 8.9
```

Fallback if mise has no gradle plugin: download `https://services.gradle.org/distributions/gradle-8.9-bin.zip` to the scratchpad, unzip, run `<scratchpad>/gradle-8.9/bin/gradle wrapper --gradle-version 8.9` from `android/`.

- [ ] **Step 3: Update repo .gitignore**

Append to the root `.gitignore`:

```
android/local.properties
android/.gradle/
android/.kotlin/
```

(`build/` outputs are already covered by the existing `build/` pattern.)

- [ ] **Step 4: Build**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: `BUILD SUCCESSFUL`, APK at `app/build/outputs/apk/debug/app-debug.apk`. First run downloads dependencies — allow several minutes.

- [ ] **Step 5: Commit**

```bash
git add android/ .gitignore
git commit -m "feat: scaffold Android capture app"
```

---

### Task 2: Parser — types and M-PESA outgoing

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/parser/ParseResult.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/parser/SmsParser.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/parser/MpesaOutParserTest.kt`

**Interfaces:**
- Produces (used by every later task):

```kotlin
enum class Direction(val wire: String) { IN("in"), OUT("out"), TRANSFER("transfer") }
enum class Source(val wire: String) { MPESA("mpesa"), AIRTEL("airtel") }

sealed interface ParseResult {
    data class Tx(
        val txnId: String,
        val amount: Double,
        val direction: Direction,
        val source: Source,
        val counterparty: String,
        val dateTimeMillis: Long,
        val balance: Double?,
        val cost: Double,
    ) : ParseResult
    data object Ignore : ParseResult
    data class Failed(val reason: String) : ParseResult
}

object SmsParser {
    fun parse(sender: String, body: String, zone: ZoneId = ZoneId.systemDefault()): ParseResult
}
```

- [ ] **Step 1: Write the failing test**

`MpesaOutParserTest.kt` — fixtures are anonymized ports of the Go test cases and real inbox structure:

```kotlin
package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class MpesaOutParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")

    private fun parse(body: String) = SmsParser.parse("MPESA", body, zone)

    @Test
    fun parsesSentTo() {
        val r = parse(
            "TID60759AQ Confirmed. Ksh300.00 sent to Jane Wanjiku on 13/9/26 at 9:24 AM. " +
                "New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals("TID60759AQ", tx.txnId)
        assertEquals(300.0, tx.amount, 0.001)
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(Source.MPESA, tx.source)
        assertEquals("Jane Wanjiku", tx.counterparty)
        assertEquals(1761.18, tx.balance!!, 0.001)
        assertEquals(7.0, tx.cost, 0.001)
        val expected = LocalDateTime.of(2026, 9, 13, 9, 24).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun parsesPaidToWithNoSpaceBeforeAmPm() {
        val r = parse(
            "TIL4XR5BBM Confirmed. Ksh25.00 paid to Acme Waters. on 21/9/26 at 7:00PM. " +
                "New M-PESA balance is Ksh164.18. Transaction cost, Ksh0.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals("Acme Waters", tx.counterparty)
        assertEquals(25.0, tx.amount, 0.001)
    }

    @Test
    fun parsesBusinessBalanceVariant() {
        val r = parse(
            "TIL7XUOPX7 Confirmed. Ksh80.00 sent to John Otieno on 21/9/26 at 7:13 PM. " +
                "New business balance is Ksh44.18. Transaction cost, Ksh0.00."
        )
        assertTrue(r is ParseResult.Tx)
    }

    @Test
    fun unknownSenderIsIgnored() {
        assertEquals(ParseResult.Ignore, SmsParser.parse("RandomShop", "Ksh100 sent to you", zone))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.*"`
Expected: FAIL — classes don't exist (compile error).

- [ ] **Step 3: Implement**

`ParseResult.kt`: exactly the types from the Interfaces block above (package `com.ngigi.wallet.parser`).

`SmsParser.kt`:

```kotlin
package com.ngigi.wallet.parser

import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

object SmsParser {
    private const val MONEY = """Ksh[\d,]+(?:\.\d+)?"""

    private val mpesaOut = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*($MONEY)\s+(?:sent|paid)\s+to\s+(.*?)\s*\.?\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*New\s+(?:M-PESA|business)\s+balance\s+is\s+($MONEY)\.\s*Transaction\s+cost,?\s*($MONEY)""",
        RegexOption.IGNORE_CASE
    )

    private val mpesaDateTime = DateTimeFormatter.ofPattern("d/M/uu h:mm a", Locale.ENGLISH)

    fun parse(sender: String, body: String, zone: ZoneId = ZoneId.systemDefault()): ParseResult {
        return when (sender.lowercase()) {
            "mpesa" -> parseMpesa(body.trim(), zone)
            "airtelmoney" -> parseAirtel(body.trim(), zone)
            else -> ParseResult.Ignore
        }
    }

    private fun parseMpesa(body: String, zone: ZoneId): ParseResult {
        mpesaOut.find(body)?.let { m ->
            val (id, amount, who, date, time, balance, cost) = m.destructured
            return ParseResult.Tx(
                txnId = id,
                amount = money(amount),
                direction = Direction.OUT,
                source = Source.MPESA,
                counterparty = cleanName(who),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(body),
                balance = money(balance),
                cost = money(cost),
            )
        }
        return classifyUnmatchedMpesa(body)
    }

    // Extended with in/withdraw/transfer variants in Task 3.
    private fun classifyUnmatchedMpesa(body: String): ParseResult =
        if (body.contains("confirmed", ignoreCase = true)) {
            ParseResult.Failed("unrecognized M-PESA transaction format")
        } else {
            ParseResult.Ignore
        }

    // Implemented in Task 4.
    private fun parseAirtel(body: String, zone: ZoneId): ParseResult = ParseResult.Ignore

    internal fun money(raw: String): Double =
        raw.replace("Ksh", "", ignoreCase = true).replace(",", "").trim().toDouble()

    internal fun cleanName(raw: String): String = raw
        .replace(Regex("""\s+in\s+\w+\s+via\s+\w+$""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("""\s+\d{2,4}\*+\d{2,4}$"""), "")
        .trim().trimEnd('.')
        .replace(Regex("""\s+"""), " ")

    internal fun mpesaMillis(date: String, time: String, zone: ZoneId): Long? = try {
        var t = time.uppercase(Locale.ENGLISH).replace(Regex("""(\d)([AP]M)"""), "$1 $2")
        LocalDateTime.parse("$date ${t}", mpesaDateTime).atZone(zone).toInstant().toEpochMilli()
    } catch (e: Exception) {
        null
    }

    private fun failedDate(body: String) = ParseResult.Failed("unparseable date/time")
}
```

Note: Kotlin's `destructured` supports up to component5 by default for MatchResult — it actually provides up to 10; the 7-value destructuring above works. If the compiler disagrees, use `m.groupValues[1]`…`[7]` instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.*"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/parser/ android/app/src/test/
git commit -m "feat: SMS parser with M-PESA outgoing support"
```

---

### Task 3: Parser — M-PESA incoming, withdraw, Pochi transfer, ignorables

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/parser/SmsParser.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/parser/MpesaVariantsParserTest.kt`

**Interfaces:**
- Consumes/extends: `SmsParser.parseMpesa` (Task 2). No signature changes.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

class MpesaVariantsParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")
    private fun parse(body: String) = SmsParser.parse("MPESA", body, zone)

    @Test
    fun parsesReceivedWithViaSuffixAndLowercaseConfirmed() {
        val r = parse(
            "UHRDS4LTFU confirmed. You have received Ksh374.00 from Peter Kamau Njoroge in FR via EQT " +
                "on 27/8/26 at 8:13 PM. New M-PESA balance is Ksh11,012.18."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.IN, tx.direction)
        assertEquals("Peter Kamau Njoroge", tx.counterparty)
        assertEquals(374.0, tx.amount, 0.001)
        assertEquals(0.0, tx.cost, 0.001)
    }

    @Test
    fun parsesReceivedWithMaskedPhoneAndNoSpaceAfterConfirmed() {
        val r = parse(
            "UHRQB432RV Confirmed.You have received Ksh360.00 from MARY  ATIENO 0711***155 on 27/8/26 " +
                "at 2:47 PM  New M-PESA balance is Ksh10,945.18. Invest & earn daily interest with ZIIDI on https://example.com"
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.IN, tx.direction)
        assertEquals("MARY ATIENO", tx.counterparty)
    }

    @Test
    fun parsesReceivedIntoBusinessBalance() {
        val r = parse(
            "UEKQB4R7LG Confirmed.You have received Ksh500.00 from MARY  ATIENO on 20/5/26 at 8:51 PM  " +
                "New business balance is Ksh41,488.00. To access your funds, Dial *334#,select Pochi la Biashara & Withdraw funds."
        )
        assertEquals(Direction.IN, (r as ParseResult.Tx).direction)
    }

    @Test
    fun parsesAgentWithdrawWithDateBeforeVerb() {
        val r = parse(
            "UHADS2L7OQ Confirmed.on 10/8/26 at 2:25 PMWithdraw Ksh5,000.00 from 448431 - Acme Agencies Ltd Sample Mall " +
                "New M-PESA balance is Ksh622.18. Transaction cost, Ksh69.00. Amount you can transact within the day is 494,800.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(5000.0, tx.amount, 0.001)
        assertEquals(69.0, tx.cost, 0.001)
        assertTrue(tx.counterparty.startsWith("448431"))
    }

    @Test
    fun parsesPochiMoveAsTransfer() {
        val r = parse(
            "UHUDS4XKO7 Confirmed, Ksh8,000.00 has been moved from your M-PESA account to your Pochi account " +
                "on 30/8/26 at 6:29 PM.. New Pochi balance is Ksh8,016.00. New M-PESA balance is Ksh1,494.18. Transaction cost, Ksh0.00."
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.TRANSFER, tx.direction)
        assertEquals(8000.0, tx.amount, 0.001)
    }

    @Test
    fun ignoresNonTransactionalMessages() {
        val bodies = listOf(
            "Transaction failed. The format of your account number is incorrect. Please check and try again with the correct format of your account number.",
            "Insufficient funds in your M-PESA account for this transaction, to register for Fuliza M-PESA service, Dial *334#OK",
            "The number you are trying to pay has not joined the service. Kindly ask the recipient to dial *334# and select Pochi la Biashara to Join.",
        )
        for (b in bodies) assertEquals("for: $b", ParseResult.Ignore, parse(b))
    }

    @Test
    fun transactionalLookingButUnknownFormatFails() {
        val r = parse("UXXXX1 Confirmed. Ksh50.00 teleported to Nowhere on 1/1/26 at 1:00 PM.")
        assertTrue(r is ParseResult.Failed)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.MpesaVariantsParserTest"`
Expected: FAIL — received/withdraw/pochi cases return `Failed` or `Ignore`.

- [ ] **Step 3: Implement** — add to `SmsParser`:

```kotlin
    private val mpesaIn = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*You have received\s+($MONEY)\s+from\s+(.+?)\s+on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*New\s+(?:M-PESA|business)\s+balance\s+is\s+($MONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaWithdraw = Regex(
        """^(\w+)\s+Confirmed\.?,?\s*on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)\.?\s*Withdraw\s+($MONEY)\s+from\s+(.+?)\s+New\s+M-PESA\s+balance\s+is\s+($MONEY)\.?\s*Transaction\s+cost,?\s*($MONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaTransfer = Regex(
        """^(\w+)\s+Confirmed[.,]?\s*($MONEY)\s+has been moved from your (?:M-PESA|Pochi) account to your (M-PESA|Pochi) account on\s+(\d{1,2}/\d{1,2}/\d{2})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)""",
        RegexOption.IGNORE_CASE
    )
    private val mpesaBalance = Regex("""New\s+M-PESA\s+balance\s+is\s+($MONEY)""", RegexOption.IGNORE_CASE)
    private val mpesaCost = Regex("""Transaction\s+cost,?\s*($MONEY)""", RegexOption.IGNORE_CASE)
```

In `parseMpesa`, after the `mpesaOut` attempt and before `classifyUnmatchedMpesa`, try each in order:

```kotlin
        mpesaIn.find(body)?.let { m ->
            val (id, amount, who, date, time, balance) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.IN,
                source = Source.MPESA, counterparty = cleanName(who),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(body),
                balance = money(balance), cost = 0.0,
            )
        }
        mpesaWithdraw.find(body)?.let { m ->
            val (id, date, time, amount, agent, balance, cost) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.OUT,
                source = Source.MPESA, counterparty = cleanName(agent),
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(body),
                balance = money(balance), cost = money(cost),
            )
        }
        mpesaTransfer.find(body)?.let { m ->
            val (id, amount, target, date, time) = m.destructured
            return ParseResult.Tx(
                txnId = id, amount = money(amount), direction = Direction.TRANSFER,
                source = Source.MPESA, counterparty = "Pochi transfer ($target)",
                dateTimeMillis = mpesaMillis(date, time, zone) ?: return failedDate(body),
                balance = mpesaBalance.find(body)?.groupValues?.get(1)?.let(::money),
                cost = mpesaCost.find(body)?.groupValues?.get(1)?.let(::money) ?: 0.0,
            )
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.*"`
Expected: PASS (all parser tests, including Task 2's).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/parser/ android/app/src/test/
git commit -m "feat: parse M-PESA incoming, withdraw, and Pochi transfer variants"
```

---

### Task 4: Parser — Airtel Money formats

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/parser/SmsParser.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/parser/AirtelParserTest.kt`

**Interfaces:**
- Consumes/extends: `SmsParser.parseAirtel` stub (Task 2).

- [ ] **Step 1: Write the failing test**

```kotlin
package com.ngigi.wallet.parser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class AirtelParserTest {
    private val zone = ZoneId.of("Africa/Nairobi")
    private fun parse(body: String) = SmsParser.parse("airtelmoney", body, zone)

    @Test
    fun parsesPaidFormat24hFullYear() {
        val r = parse(
            "V3QHT5XTD1A. Ksh 40 paid to SAMPLE VENDOR LTD account 1234567 on 27/08/2026 08:00. " +
                "Fee Ksh 0. Bal:Ksh 175.0. MPESA ID:UHRS04XXX7"
        )
        val tx = r as ParseResult.Tx
        assertEquals("V3QHT5XTD1A", tx.txnId)
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(Source.AIRTEL, tx.source)
        assertEquals(40.0, tx.amount, 0.001)
        assertEquals(0.0, tx.cost, 0.001)
        assertEquals(175.0, tx.balance!!, 0.001)
        val expected = LocalDateTime.of(2026, 8, 27, 8, 0).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun parsesSentFormat12hShortYear() {
        val r = parse(
            "Y3QFOYKIPRY. Ksh 40 sent to Grace Akinyi 254700000000 on 25/08/26 at 07:01 PM. " +
                "Fee: Ksh 0. Bal: Ksh 215.0. MPESA ID: UHPHD4XXX4"
        )
        val tx = r as ParseResult.Tx
        assertEquals(Direction.OUT, tx.direction)
        assertEquals(40.0, tx.amount, 0.001)
        val expected = LocalDateTime.of(2026, 8, 25, 19, 1).atZone(zone).toInstant().toEpochMilli()
        assertEquals(expected, tx.dateTimeMillis)
    }

    @Test
    fun sameTxnIdInBothFormatsParsesToSameId() {
        val a = parse("V3QHT5XTD1A. Ksh 40 paid to SAMPLE VENDOR account 123 on 27/08/2026 08:00. Fee Ksh 0. Bal:Ksh 175.0. MPESA ID:UHRS04XXX7") as ParseResult.Tx
        val b = parse("V3QHT5XTD1A. Ksh 40 paid to Lipa Na Mpesa via Airtel Money on 27/08/26 at 08:00 AM. Fee: Ksh 0. Bal: Ksh 175.0. MPESA ID: UHRS04XXX7") as ParseResult.Tx
        assertEquals(a.txnId, b.txnId)
    }

    @Test
    fun ignoresPromosFromMoneySender() {
        val bodies = listOf(
            "Get 50% CASHBACK REWARD on transaction fees every time you transfer money from your bank account to Airtel Money. Use your bank's USSD code or app today!",
            "Congratulations! You have received KES 3.04  in your BONUS wallet. To check balance/ claim your bonus, Dial*334# > Option 98 or click https://example.com",
        )
        for (b in bodies) assertEquals("for: $b", ParseResult.Ignore, parse(b))
    }

    @Test
    fun transactionalLookingButUnknownAirtelFormatFails() {
        val r = parse("ZZ9AB12CD3E. Ksh 40 beamed to Somewhere on 25/08/26. Fee: Ksh 0.")
        assertTrue(r is ParseResult.Failed)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.AirtelParserTest"`
Expected: FAIL — all Airtel bodies currently return `Ignore`.

- [ ] **Step 3: Implement** — replace the `parseAirtel` stub:

```kotlin
    private const val AMONEY = """[\d,]+(?:\.\d+)?"""
    private val airtel24h = Regex(
        """^([A-Za-z0-9]+)\.\s+Ksh\s*($AMONEY)\s+(?:sent|paid) to\s+(.+?)\s+on\s+(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2})\.\s*Fee:?\s*Ksh\s*($AMONEY)\.\s*Bal:?\s*Ksh\s*($AMONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val airtel12h = Regex(
        """^([A-Za-z0-9]+)\.\s+Ksh\s*($AMONEY)\s+(?:sent|paid) to\s+(.+?)\s+on\s+(\d{2}/\d{2}/\d{2})\s+at\s+(\d{2}:\d{2})\s*([AP]M)\.\s*Fee:?\s*Ksh\s*($AMONEY)\.\s*Bal:?\s*Ksh\s*($AMONEY)""",
        RegexOption.IGNORE_CASE
    )
    private val airtelTransactional = Regex("""^[A-Za-z0-9]{8,}\.\s+Ksh""")
    private val airtel24hFmt = DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm", Locale.ENGLISH)
    private val airtel12hFmt = DateTimeFormatter.ofPattern("dd/MM/uu hh:mm a", Locale.ENGLISH)

    private fun parseAirtel(body: String, zone: ZoneId): ParseResult {
        airtel24h.find(body)?.let { m ->
            val (id, amount, who, date, time, fee, bal) = m.destructured
            val millis = try {
                LocalDateTime.parse("$date $time", airtel24hFmt).atZone(zone).toInstant().toEpochMilli()
            } catch (e: Exception) { return failedDate(body) }
            return ParseResult.Tx(id, money(amount), Direction.OUT, Source.AIRTEL,
                cleanName(who), millis, money(bal), money(fee))
        }
        airtel12h.find(body)?.let { m ->
            val (id, amount, who, date, time, ampm, fee, bal) = m.destructured
            val millis = try {
                LocalDateTime.parse("$date $time ${ampm.uppercase()}", airtel12hFmt)
                    .atZone(zone).toInstant().toEpochMilli()
            } catch (e: Exception) { return failedDate(body) }
            return ParseResult.Tx(id, money(amount), Direction.OUT, Source.AIRTEL,
                cleanName(who), millis, money(bal), money(fee))
        }
        return if (airtelTransactional.containsMatchIn(body)) {
            ParseResult.Failed("unrecognized Airtel transaction format")
        } else {
            ParseResult.Ignore
        }
    }
```

Note `money()` already strips `Ksh`/commas; it receives bare numbers here, which is fine. The 8-value destructuring in `airtel12h` uses `component8` — supported on `MatchResult.Destructured`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.parser.*"`
Expected: PASS (all parser tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/parser/ android/app/src/test/
git commit -m "feat: parse both Airtel Money outgoing formats"
```

---

### Task 5: Room database

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/data/TransactionEntity.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/data/AppDb.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/data/Categories.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/data/DaoTest.kt`

**Interfaces:**
- Produces (used by Tasks 6-12):

```kotlin
object Status { const val UNTAGGED = "UNTAGGED"; const val TAGGED = "TAGGED"; const val SYNCED = "SYNCED"; const val PARSE_FAILED = "PARSE_FAILED" }
object Categories { val ALL = listOf("food", "travel", "savings", "church", "investments", "income"); const val TRANSFER = "transfer" }
data class TransactionEntity(...)          // fields below
interface TransactionDao                    // methods below
abstract class AppDb : RoomDatabase { abstract fun dao(): TransactionDao; companion object { fun get(context: Context): AppDb } }
```

- [ ] **Step 1: Write the entity, DAO, and DB** (Room code is declarative; test-first on the DAO queries in Step 2)

`TransactionEntity.kt`:

```kotlin
package com.ngigi.wallet.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

object Status {
    const val UNTAGGED = "UNTAGGED"
    const val TAGGED = "TAGGED"
    const val SYNCED = "SYNCED"
    const val PARSE_FAILED = "PARSE_FAILED"
}

@Entity(tableName = "transactions", indices = [Index(value = ["txn_id"], unique = true)])
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    @ColumnInfo(name = "txn_id") val txnId: String,
    val amount: Double,
    val direction: String,      // "in" | "out" | "transfer"
    val source: String,         // "mpesa" | "airtel"
    val counterparty: String,
    @ColumnInfo(name = "date_time") val dateTime: Long,   // epoch millis
    val balance: Double?,
    val cost: Double,
    val category: String?,
    val reason: String?,
    val status: String,
    @ColumnInfo(name = "sync_error") val syncError: String? = null,
    @ColumnInfo(name = "raw_body") val rawBody: String,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)
```

`Categories.kt`:

```kotlin
package com.ngigi.wallet.data

object Categories {
    val ALL = listOf("food", "travel", "savings", "church", "investments", "income")
    const val TRANSFER = "transfer"
}
```

`TransactionDao.kt`:

```kotlin
package com.ngigi.wallet.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

data class CategoryCount(val category: String, val n: Int)

@Dao
interface TransactionDao {
    /** Returns -1 when a row with the same txn_id already exists. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(t: TransactionEntity): Long

    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun byId(id: Long): TransactionEntity?

    @Query("UPDATE transactions SET category = :category, reason = :reason, status = '${Status.TAGGED}', sync_error = NULL WHERE id = :id")
    suspend fun tag(id: Long, category: String, reason: String?)

    @Query("""UPDATE transactions SET amount = :amount, direction = :direction, counterparty = :counterparty,
              category = :category, reason = :reason, status = '${Status.TAGGED}', sync_error = NULL WHERE id = :id""")
    suspend fun completeManual(id: Long, amount: Double, direction: String, counterparty: String, category: String, reason: String?)

    @Query("""SELECT * FROM transactions
              WHERE status IN ('${Status.UNTAGGED}', '${Status.PARSE_FAILED}') OR sync_error IS NOT NULL
              ORDER BY date_time DESC""")
    fun inbox(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions WHERE status IN ('${Status.UNTAGGED}', '${Status.PARSE_FAILED}')")
    suspend fun inboxCount(): Int

    @Query("SELECT * FROM transactions WHERE status = '${Status.TAGGED}'")
    suspend fun unsynced(): List<TransactionEntity>

    @Query("UPDATE transactions SET status = '${Status.SYNCED}' WHERE id = :id")
    suspend fun markSynced(id: Long)

    @Query("UPDATE transactions SET sync_error = :error WHERE id = :id")
    suspend fun setSyncError(id: Long, error: String)

    @Query("SELECT COUNT(*) FROM transactions")
    suspend fun count(): Int

    @Query("""SELECT category, COUNT(*) AS n FROM transactions
              WHERE category IS NOT NULL AND category != '${Categories.TRANSFER}'
              GROUP BY category ORDER BY n DESC LIMIT 2""")
    suspend fun topCategories(): List<CategoryCount>
}
```

`AppDb.kt`:

```kotlin
package com.ngigi.wallet.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [TransactionEntity::class], version = 1)
abstract class AppDb : RoomDatabase() {
    abstract fun dao(): TransactionDao

    companion object {
        @Volatile private var instance: AppDb? = null

        fun get(context: Context): AppDb = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(context.applicationContext, AppDb::class.java, "wallet.db")
                .build().also { instance = it }
        }
    }
}
```

- [ ] **Step 2: Write the DAO test**

`DaoTest.kt`:

```kotlin
package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class DaoTest {
    private lateinit var db: AppDb
    private lateinit var dao: TransactionDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        dao = db.dao()
    }

    @After
    fun tearDown() = db.close()

    private fun entity(txnId: String, status: String = Status.UNTAGGED, category: String? = null) =
        TransactionEntity(
            txnId = txnId, amount = 100.0, direction = "out", source = "mpesa",
            counterparty = "Shop", dateTime = 1000L, balance = 500.0, cost = 0.0,
            category = category, reason = null, status = status,
            rawBody = "raw", createdAt = 1000L,
        )

    @Test
    fun insertIgnoresDuplicateTxnId() = runBlocking {
        val first = dao.insert(entity("T1"))
        val dup = dao.insert(entity("T1"))
        assertEquals(true, first > 0)
        assertEquals(-1L, dup)
        assertEquals(1, dao.count())
    }

    @Test
    fun tagMovesRowOutOfInbox() = runBlocking {
        val id = dao.insert(entity("T1"))
        assertEquals(1, dao.inbox().first().size)
        dao.tag(id, "food", "lunch")
        assertEquals(0, dao.inbox().first().size)
        val row = dao.byId(id)!!
        assertEquals(Status.TAGGED, row.status)
        assertEquals("food", row.category)
        assertEquals(listOf(row.id), dao.unsynced().map { it.id })
    }

    @Test
    fun parseFailedAndSyncErrorRowsAppearInInbox() = runBlocking {
        dao.insert(entity("T1", status = Status.PARSE_FAILED))
        val id2 = dao.insert(entity("T2", status = Status.TAGGED, category = "food"))
        dao.setSyncError(id2, "rejected by server")
        assertEquals(2, dao.inbox().first().size)
        assertEquals(1, dao.inboxCount()) // sync-error row is TAGGED, not counted as untagged
    }

    @Test
    fun markSyncedClearsFromUnsynced() = runBlocking {
        val id = dao.insert(entity("T1", status = Status.TAGGED, category = "food"))
        dao.markSynced(id)
        assertEquals(0, dao.unsynced().size)
        assertNull(dao.byId(id)!!.syncError)
    }

    @Test
    fun topCategoriesExcludesTransferAndOrdersByCount() = runBlocking {
        dao.insert(entity("A", status = Status.SYNCED, category = "food"))
        dao.insert(entity("B", status = Status.SYNCED, category = "food"))
        dao.insert(entity("C", status = Status.SYNCED, category = "travel"))
        dao.insert(entity("D", status = Status.SYNCED, category = Categories.TRANSFER))
        val top = dao.topCategories()
        assertEquals(listOf("food", "travel"), top.map { it.category })
    }
}
```

- [ ] **Step 3: Run the tests**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.DaoTest"`
Expected: PASS (5 tests). If KSP/Room codegen errors appear, fix them before proceeding — nothing else builds without this task.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/data/ android/app/src/test/
git commit -m "feat: Room database with transaction entity and dao"
```

---

### Task 6: SmsHandler, Notifier, receivers

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/notify/Notifier.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/notify/TagActionReceiver.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/sms/SmsHandler.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/sms/SmsReceiver.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Test: `android/app/src/test/java/com/ngigi/wallet/sms/SmsHandlerTest.kt`

**Interfaces:**
- Consumes: `SmsParser` (Tasks 2-4), `TransactionDao`/`Status`/`Categories` (Task 5).
- Produces:

```kotlin
interface Notifier {
    fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>)
    fun notifyParseFailed(rowId: Long)
}
fun interface SyncRequester { fun requestSync() }
class SmsHandler(dao: TransactionDao, notifier: Notifier, sync: SyncRequester) {
    suspend fun handle(sender: String, body: String)
}
object Sync { fun requestSync(context: Context) }  // real WorkManager impl lands in Task 10; Task 6 creates the stub
```

- [ ] **Step 1: Write the failing test**

`SmsHandlerTest.kt`:

```kotlin
package com.ngigi.wallet.sms

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.notify.Notifier
import com.ngigi.wallet.parser.ParseResult
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SmsHandlerTest {
    private lateinit var db: AppDb
    private val notified = mutableListOf<String>()
    private var syncRequests = 0

    private val fakeNotifier = object : Notifier {
        override fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>) {
            notified.add("tx:$rowId")
        }
        override fun notifyParseFailed(rowId: Long) { notified.add("failed:$rowId") }
    }

    private lateinit var handler: SmsHandler

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        handler = SmsHandler(db.dao(), fakeNotifier) { syncRequests++ }
    }

    @After
    fun tearDown() = db.close()

    private val sentBody = "TID60759AQ Confirmed. Ksh300.00 sent to Jane Wanjiku on 13/9/26 at 9:24 AM. " +
        "New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00."

    @Test
    fun storesUntaggedAndNotifies() = runBlocking {
        handler.handle("MPESA", sentBody)
        val row = db.dao().byId(1L)!!
        assertEquals(Status.UNTAGGED, row.status)
        assertEquals("TID60759AQ", row.txnId)
        assertEquals(sentBody, row.rawBody)
        assertEquals(listOf("tx:1"), notified)
        assertEquals(0, syncRequests)
    }

    @Test
    fun duplicateSmsDoesNotDoubleStoreOrNotify() = runBlocking {
        handler.handle("MPESA", sentBody)
        handler.handle("MPESA", sentBody)
        assertEquals(1, db.dao().count())
        assertEquals(1, notified.size)
    }

    @Test
    fun transferIsAutoTaggedAndSyncRequested() = runBlocking {
        handler.handle(
            "MPESA",
            "UHUDS4XKO7 Confirmed, Ksh8,000.00 has been moved from your M-PESA account to your Pochi account " +
                "on 30/8/26 at 6:29 PM.. New Pochi balance is Ksh8,016.00. New M-PESA balance is Ksh1,494.18. Transaction cost, Ksh0.00."
        )
        val row = db.dao().byId(1L)!!
        assertEquals(Status.TAGGED, row.status)
        assertEquals(Categories.TRANSFER, row.category)
        assertEquals(0, notified.size)
        assertEquals(1, syncRequests)
    }

    @Test
    fun parseFailureStoresRawBodyAndNotifies() = runBlocking {
        handler.handle("MPESA", "UXXXX1 Confirmed. Ksh50.00 teleported to Nowhere on 1/1/26 at 1:00 PM.")
        val row = db.dao().byId(1L)!!
        assertEquals(Status.PARSE_FAILED, row.status)
        assertEquals(listOf("failed:1"), notified)
    }

    @Test
    fun promoIsFullyIgnored() = runBlocking {
        handler.handle("MPESA", "Insufficient funds in your M-PESA account for this transaction, to register for Fuliza M-PESA service, Dial *334#OK")
        assertEquals(0, db.dao().count())
        assertEquals(0, notified.size)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sms.SmsHandlerTest"`
Expected: FAIL — `SmsHandler` does not exist.

- [ ] **Step 3: Implement**

`Notifier.kt` (interface + Android implementation):

```kotlin
package com.ngigi.wallet.notify

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.ngigi.wallet.TagActivity
import com.ngigi.wallet.parser.Direction
import com.ngigi.wallet.parser.ParseResult

interface Notifier {
    fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>)
    fun notifyParseFailed(rowId: Long)
}

class AndroidNotifier(private val context: Context) : Notifier {
    companion object {
        const val CHANNEL_TX = "transactions"
        fun ensureChannels(context: Context) {
            val mgr = context.getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(CHANNEL_TX, "Transactions", NotificationManager.IMPORTANCE_HIGH)
            )
        }
    }

    override fun notifyNewTransaction(rowId: Long, tx: ParseResult.Tx, topCategories: List<String>) {
        ensureChannels(context)
        val dirLabel = if (tx.direction == Direction.IN) "Money IN" else "Money OUT"
        val srcLabel = tx.source.wire.uppercase()
        val builder = NotificationCompat.Builder(context, CHANNEL_TX)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Ksh %,.0f %s %s".format(tx.amount, if (tx.direction == Direction.IN) "←" else "→", tx.counterparty))
            .setContentText("$dirLabel · $srcLabel · tap for details")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tagActivityIntent(rowId))

        topCategories.take(2).forEachIndexed { i, cat ->
            val intent = Intent(context, TagActionReceiver::class.java)
                .putExtra("row_id", rowId).putExtra("category", cat)
            val pi = PendingIntent.getBroadcast(
                context, (rowId * 10 + i).toInt(), intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            builder.addAction(0, cat.replaceFirstChar { it.uppercase() }, pi)
        }
        builder.addAction(0, "More…", tagActivityIntent(rowId))
        notify(rowId, builder)
    }

    override fun notifyParseFailed(rowId: Long) {
        ensureChannels(context)
        val builder = NotificationCompat.Builder(context, CHANNEL_TX)
            .setSmallIcon(android.R.drawable.stat_notify_error)
            .setContentTitle("Couldn't read a money SMS")
            .setContentText("Tap to enter it manually")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tagActivityIntent(rowId))
        notify(rowId, builder)
    }

    private fun tagActivityIntent(rowId: Long): PendingIntent =
        PendingIntent.getActivity(
            context, rowId.toInt(),
            Intent(context, TagActivity::class.java)
                .putExtra("row_id", rowId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    private fun notify(rowId: Long, builder: NotificationCompat.Builder) {
        try {
            NotificationManagerCompat.from(context).notify(rowId.toInt(), builder.build())
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS not granted; row still sits safely in the inbox.
        }
    }
}
```

Note: `TagActivity` doesn't exist until Task 7 — create an empty placeholder now so this compiles:

```kotlin
// android/app/src/main/java/com/ngigi/wallet/TagActivity.kt (fleshed out in Task 7)
package com.ngigi.wallet

import androidx.activity.ComponentActivity

class TagActivity : ComponentActivity()
```

`SmsHandler.kt`:

```kotlin
package com.ngigi.wallet.sms

import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.notify.Notifier
import com.ngigi.wallet.parser.Direction
import com.ngigi.wallet.parser.ParseResult
import com.ngigi.wallet.parser.SmsParser

fun interface SyncRequester { fun requestSync() }

class SmsHandler(
    private val dao: TransactionDao,
    private val notifier: Notifier,
    private val sync: SyncRequester,
) {
    suspend fun handle(sender: String, body: String) {
        when (val result = SmsParser.parse(sender, body)) {
            is ParseResult.Ignore -> return
            is ParseResult.Tx -> {
                val isTransfer = result.direction == Direction.TRANSFER
                val rowId = dao.insert(
                    TransactionEntity(
                        txnId = result.txnId, amount = result.amount,
                        direction = result.direction.wire, source = result.source.wire,
                        counterparty = result.counterparty, dateTime = result.dateTimeMillis,
                        balance = result.balance, cost = result.cost,
                        category = if (isTransfer) Categories.TRANSFER else null,
                        reason = null,
                        status = if (isTransfer) Status.TAGGED else Status.UNTAGGED,
                        rawBody = body, createdAt = System.currentTimeMillis(),
                    )
                )
                if (rowId == -1L) return // duplicate delivery
                if (isTransfer) {
                    sync.requestSync()
                } else {
                    // Two most-used categories, padded with defaults until usage data exists.
                    val top = (dao.topCategories().map { it.category } + listOf("food", "travel"))
                        .distinct().take(2)
                    notifier.notifyNewTransaction(rowId, result, top)
                }
            }
            is ParseResult.Failed -> {
                val rowId = dao.insert(
                    TransactionEntity(
                        txnId = "raw-" + body.hashCode().toUInt().toString(16),
                        amount = 0.0, direction = Direction.OUT.wire,
                        source = if (sender.lowercase() == "mpesa") "mpesa" else "airtel",
                        counterparty = "", dateTime = System.currentTimeMillis(),
                        balance = null, cost = 0.0, category = null, reason = null,
                        status = Status.PARSE_FAILED, rawBody = body,
                        createdAt = System.currentTimeMillis(),
                    )
                )
                if (rowId != -1L) notifier.notifyParseFailed(rowId)
            }
        }
    }
}
```

`SmsReceiver.kt`:

```kotlin
package com.ngigi.wallet.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import com.ngigi.wallet.sync.Sync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SmsReceiver : BroadcastReceiver() {
    private val senders = setOf("mpesa", "airtelmoney")

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        // Multipart SMS arrive as several PDUs from one sender; reassemble the body.
        val bySender = messages.groupBy { it.displayOriginatingAddress ?: "" }
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext
                val handler = SmsHandler(
                    AppDb.get(app).dao(),
                    AndroidNotifier(app),
                ) { Sync.requestSync(app) }
                for ((sender, parts) in bySender) {
                    if (sender.lowercase() !in senders) continue
                    handler.handle(sender, parts.joinToString("") { it.messageBody ?: "" })
                }
            } finally {
                pending.finish()
            }
        }
    }
}
```

`TagActionReceiver.kt`:

```kotlin
package com.ngigi.wallet.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.sync.Sync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class TagActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val rowId = intent.getLongExtra("row_id", -1)
        val category = intent.getStringExtra("category") ?: return
        if (rowId == -1L) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val app = context.applicationContext
                AppDb.get(app).dao().tag(rowId, category, null)
                NotificationManagerCompat.from(app).cancel(rowId.toInt())
                Sync.requestSync(app)
            } finally {
                pending.finish()
            }
        }
    }
}
```

`Sync` stub so this compiles (real WorkManager implementation in Task 10) — `android/app/src/main/java/com/ngigi/wallet/sync/Sync.kt`:

```kotlin
package com.ngigi.wallet.sync

import android.content.Context

object Sync {
    fun requestSync(context: Context) { /* WorkManager enqueue lands in Task 10 */ }
}
```

Manifest — inside `<application>` add:

```xml
        <activity android:name=".TagActivity" android:exported="false"
            android:excludeFromRecents="true" />
        <receiver android:name=".sms.SmsReceiver" android:exported="true"
            android:permission="android.permission.BROADCAST_SMS">
            <intent-filter android:priority="999">
                <action android:name="android.provider.Telephony.SMS_RECEIVED" />
            </intent-filter>
        </receiver>
        <receiver android:name=".notify.TagActionReceiver" android:exported="false" />
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sms.SmsHandlerTest"` then the full suite `./gradlew :app:testDebugUnitTest`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/ android/app/src/test/
git commit -m "feat: SMS receiver, handler, and tag notifications"
```

---

### Task 7: TagActivity

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/TagActivity.kt` (replace placeholder)
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/TagScreen.kt`

**Interfaces:**
- Consumes: `TransactionDao.byId/tag/completeManual` (Task 5), `Sync.requestSync` (Task 6 stub → Task 10 real).
- Produces: `TagActivity` launched with long extra `"row_id"` — used by notifications (Task 6) and the Inbox (Task 8).

- [ ] **Step 1: Implement the screen**

`ui/TagScreen.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.Categories
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** onSave(amount, direction, counterparty, category, reason) — amount/direction/counterparty
 *  only differ from the row for PARSE_FAILED manual entry. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TagScreen(row: TransactionEntity, onSave: (Double, String, String, String, String?) -> Unit) {
    val manual = row.status == Status.PARSE_FAILED
    var amount by remember { mutableStateOf(if (manual) "" else row.amount.toString()) }
    var direction by remember { mutableStateOf(row.direction) }
    var counterparty by remember { mutableStateOf(row.counterparty) }
    var category by remember { mutableStateOf(row.category ?: "") }
    var reason by remember { mutableStateOf(row.reason ?: "") }
    val fmt = remember { SimpleDateFormat("EEE d MMM, h:mm a", Locale.ENGLISH) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (manual) {
            Text("Couldn't parse this SMS — enter it manually:", style = MaterialTheme.typography.titleMedium)
            Text(row.rawBody, style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(amount, { amount = it }, label = { Text("Amount (Ksh)") })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("out", "in", "transfer").forEach { d ->
                    FilterChip(selected = direction == d, onClick = { direction = d }, label = { Text(d) })
                }
            }
            OutlinedTextField(counterparty, { counterparty = it }, label = { Text("Counterparty") })
        } else {
            Text(
                "Ksh %,.2f %s %s".format(row.amount, if (row.direction == "in") "from" else "to", row.counterparty),
                style = MaterialTheme.typography.titleLarge
            )
            Text(
                "${if (row.direction == "in") "Money IN" else "Money OUT"} · ${row.source.uppercase()} · ${fmt.format(Date(row.dateTime))}",
                style = MaterialTheme.typography.bodyMedium
            )
        }

        Text("Category", style = MaterialTheme.typography.titleMedium)
        LazyVerticalGrid(columns = GridCells.Fixed(3), horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.height(120.dp)) {
            items(Categories.ALL) { cat ->
                FilterChip(selected = category == cat, onClick = { category = cat },
                    label = { Text(cat, Modifier.fillMaxWidth(), maxLines = 1) })
            }
        }

        OutlinedTextField(reason, { reason = it }, label = { Text("Reason (optional)") }, modifier = Modifier.fillMaxWidth())

        Button(
            onClick = {
                onSave(amount.toDoubleOrNull() ?: row.amount, direction, counterparty,
                    category, reason.ifBlank { null })
            },
            enabled = category.isNotBlank() && (!manual || amount.toDoubleOrNull() != null),
            modifier = Modifier.align(Alignment.End)
        ) { Text("Save") }
    }
}
```

`TagActivity.kt` (replace the placeholder):

```kotlin
package com.ngigi.wallet

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.sync.Sync
import com.ngigi.wallet.ui.TagScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import androidx.lifecycle.lifecycleScope

class TagActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val rowId = intent.getLongExtra("row_id", -1)
        if (rowId == -1L) { finish(); return }
        val dao = AppDb.get(this).dao()

        setContent {
            var row by remember { mutableStateOf<TransactionEntity?>(null) }
            LaunchedEffect(rowId) { row = dao.byId(rowId) }
            MaterialTheme {
                Surface {
                    row?.let { r ->
                        TagScreen(r) { amount, direction, counterparty, category, reason ->
                            lifecycleScope.launch(Dispatchers.IO) {
                                if (r.status == Status.PARSE_FAILED) {
                                    dao.completeManual(r.id, amount, direction, counterparty, category, reason)
                                } else {
                                    dao.tag(r.id, category, reason)
                                }
                                Sync.requestSync(applicationContext)
                                finish()
                            }
                        }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 2: Build**

Run: `cd android && ./gradlew :app:assembleDebug && ./gradlew :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, all existing tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/
git commit -m "feat: tagging screen with manual entry for parse failures"
```

---

### Task 8: MainActivity — permissions, tabs, Inbox

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/InboxScreen.kt`

**Interfaces:**
- Consumes: `TransactionDao.inbox()` Flow (Task 5), `TagActivity` (Task 7).
- Produces: tab scaffold with slots for `StatsScreen` (Task 12) and `SettingsScreen` (Task 11) — placeholder `Text` composables until those tasks land.

- [ ] **Step 1: Implement**

`ui/InboxScreen.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun InboxScreen(dao: TransactionDao, onOpen: (Long) -> Unit) {
    val rows by dao.inbox().collectAsStateWithLifecycle(initialValue = emptyList())
    val fmt = SimpleDateFormat("d MMM, h:mm a", Locale.ENGLISH)

    if (rows.isEmpty()) {
        Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
            Text("All caught up 🎉")
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(rows, key = { it.id }) { row ->
            ListItem(
                modifier = Modifier.clickable { onOpen(row.id) },
                headlineContent = {
                    Text(
                        when (row.status) {
                            Status.PARSE_FAILED -> "Unreadable SMS — tap to enter"
                            else -> "Ksh %,.2f %s %s".format(row.amount, if (row.direction == "in") "from" else "to", row.counterparty)
                        }
                    )
                },
                supportingContent = {
                    val err = row.syncError?.let { " · ⚠ $it" } ?: ""
                    Text("${row.source.uppercase()} · ${fmt.format(Date(row.dateTime))}$err")
                },
            )
            HorizontalDivider()
        }
    }
}
```

`MainActivity.kt` (replace):

```kotlin
package com.ngigi.wallet

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import com.ngigi.wallet.ui.InboxScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidNotifier.ensureChannels(this)
        requestNeededPermissions()
        val dao = AppDb.get(this).dao()

        setContent {
            MaterialTheme {
                var tab by remember { mutableStateOf(0) }
                Scaffold(bottomBar = {
                    NavigationBar {
                        listOf("Inbox", "Stats", "Settings").forEachIndexed { i, label ->
                            NavigationBarItem(selected = tab == i, onClick = { tab = i },
                                icon = {}, label = { Text(label) })
                        }
                    }
                }) { padding ->
                    Surface(Modifier.padding(padding)) {
                        when (tab) {
                            0 -> InboxScreen(dao) { rowId ->
                                startActivity(Intent(this, TagActivity::class.java).putExtra("row_id", rowId))
                            }
                            1 -> Text("Stats — coming in Task 12")
                            else -> Text("Settings — coming in Task 11")
                        }
                    }
                }
            }
        }
    }

    private fun requestNeededPermissions() {
        val wanted = buildList {
            add(Manifest.permission.RECEIVE_SMS)
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (wanted.isNotEmpty()) {
            registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}.launch(wanted.toTypedArray())
        }
    }
}
```

- [ ] **Step 2: Build and test**

Run: `cd android && ./gradlew :app:assembleDebug && ./gradlew :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, tests PASS.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/
git commit -m "feat: main activity with permission flow and untagged inbox"
```

---

### Task 9: ApiClient

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/sync/ApiClient.kt`
- Test: `android/app/src/test/java/com/ngigi/wallet/sync/ApiClientTest.kt`

**Interfaces:**
- Produces (used by Tasks 10-11):

```kotlin
@Serializable data class ApiTransaction(...)   // wire fields below
enum class PostResult { CREATED, DUPLICATE, CLIENT_ERROR, SERVER_ERROR }
class ApiClient(baseUrl: String, token: String, client: OkHttpClient = OkHttpClient()) {
    fun post(tx: ApiTransaction): PostResult   // throws IOException on network failure
    fun getAll(): List<ApiTransaction>         // throws IOException on network/server failure
}
object Wire {
    fun toApi(e: TransactionEntity): ApiTransaction
    fun toEntity(a: ApiTransaction): TransactionEntity  // status = SYNCED
}
```

- [ ] **Step 1: Write the failing test**

```kotlin
package com.ngigi.wallet.sync

import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: ApiClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = ApiClient(server.url("/").toString().trimEnd('/'), "tok123")
    }

    @After
    fun tearDown() = server.shutdown()

    private val entity = TransactionEntity(
        id = 1, txnId = "TID100", amount = 300.0, direction = "out", source = "mpesa",
        counterparty = "Jane Doe", dateTime = 1756617840000L, balance = 1761.18, cost = 7.0,
        category = "food", reason = "lunch", status = Status.TAGGED, rawBody = "raw", createdAt = 0,
    )

    @Test
    fun postSendsWireFormatAndAuthHeader() {
        server.enqueue(MockResponse().setResponseCode(201).setBody("""{"created":true}"""))
        val result = client.post(Wire.toApi(entity))
        assertEquals(PostResult.CREATED, result)
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("/api/transactions", req.path)
        assertEquals("Bearer tok123", req.getHeader("Authorization"))
        val body = req.body.readUtf8()
        assertTrue(body.contains("\"transaction_id\":\"TID100\""))
        assertTrue(body.contains("\"counterparty\":\"Jane Doe\""))
        assertTrue(body.contains("\"date_time\":"))
    }

    @Test
    fun postMapsStatusCodes() {
        for ((code, expected) in mapOf(200 to PostResult.DUPLICATE, 400 to PostResult.CLIENT_ERROR,
                401 to PostResult.CLIENT_ERROR, 500 to PostResult.SERVER_ERROR)) {
            server.enqueue(MockResponse().setResponseCode(code).setBody("{}"))
            assertEquals("code $code", expected, client.post(Wire.toApi(entity)))
        }
    }

    @Test
    fun getAllParsesArrayAndRoundTripsToEntity() {
        server.enqueue(MockResponse().setResponseCode(200).setBody(
            """[{"transaction_id":"L1","amount":100.0,"direction":"out","source":"mpesa",
                "counterparty":"Old Shop","date_time":"2026-08-31T10:00:00+03:00","balance":50.0,
                "cost":0.0,"category":"food","reason":""}]""".trimIndent()
        ))
        val all = client.getAll()
        assertEquals(1, all.size)
        val e = Wire.toEntity(all[0])
        assertEquals("L1", e.txnId)
        assertEquals(Status.SYNCED, e.status)
        assertTrue(e.dateTime > 0)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sync.ApiClientTest"`
Expected: FAIL — classes missing.

- [ ] **Step 3: Implement** `sync/ApiClient.kt`:

```kotlin
package com.ngigi.wallet.sync

import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Serializable
data class ApiTransaction(
    @SerialName("transaction_id") val transactionId: String,
    val amount: Double,
    val direction: String,
    val source: String,
    val counterparty: String,
    @SerialName("date_time") val dateTime: String,
    val balance: Double,
    val cost: Double,
    val category: String,
    val reason: String,
)

enum class PostResult { CREATED, DUPLICATE, CLIENT_ERROR, SERVER_ERROR }

object Wire {
    private val json = Json { ignoreUnknownKeys = true }

    fun toApi(e: TransactionEntity): ApiTransaction = ApiTransaction(
        transactionId = e.txnId, amount = e.amount, direction = e.direction, source = e.source,
        counterparty = e.counterparty,
        dateTime = OffsetDateTime.ofInstant(Instant.ofEpochMilli(e.dateTime), ZoneId.systemDefault())
            .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME),
        balance = e.balance ?: 0.0, cost = e.cost,
        category = e.category ?: "", reason = e.reason ?: "",
    )

    fun toEntity(a: ApiTransaction): TransactionEntity = TransactionEntity(
        txnId = a.transactionId, amount = a.amount, direction = a.direction, source = a.source,
        counterparty = a.counterparty,
        dateTime = OffsetDateTime.parse(a.dateTime).toInstant().toEpochMilli(),
        balance = a.balance, cost = a.cost,
        category = a.category.ifBlank { null }, reason = a.reason.ifBlank { null },
        status = Status.SYNCED, rawBody = "", createdAt = System.currentTimeMillis(),
    )

    fun encode(tx: ApiTransaction): String = json.encodeToString(ApiTransaction.serializer(), tx)
    fun decodeList(body: String): List<ApiTransaction> =
        json.decodeFromString(ListSerializer(ApiTransaction.serializer()), body)
}

class ApiClient(
    private val baseUrl: String,
    private val token: String,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val jsonType = "application/json".toMediaType()

    fun post(tx: ApiTransaction): PostResult {
        val req = Request.Builder()
            .url("$baseUrl/api/transactions")
            .header("Authorization", "Bearer $token")
            .post(Wire.encode(tx).toRequestBody(jsonType))
            .build()
        client.newCall(req).execute().use { resp ->
            return when {
                resp.code == 201 -> PostResult.CREATED
                resp.code == 200 -> PostResult.DUPLICATE
                resp.code in 400..499 -> PostResult.CLIENT_ERROR
                else -> PostResult.SERVER_ERROR
            }
        }
    }

    fun getAll(): List<ApiTransaction> {
        val req = Request.Builder()
            .url("$baseUrl/api/transactions")
            .header("Authorization", "Bearer $token")
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("GET /api/transactions returned ${resp.code}")
            return Wire.decodeList(resp.body!!.string())
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sync.ApiClientTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ngigi/wallet/sync/ android/app/src/test/
git commit -m "feat: API client with wire mapping for backend sync"
```

---

### Task 10: SyncWorker, Prefs, reminder

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/settings/Prefs.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/sync/SyncWorker.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/reminder/ReminderWorker.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/sync/Sync.kt` (replace stub)
- Modify: `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt` (schedule periodic work)
- Test: `android/app/src/test/java/com/ngigi/wallet/sync/SyncLogicTest.kt`

**Interfaces:**
- Consumes: `ApiClient`/`Wire`/`PostResult` (Task 9), DAO (Task 5), `Prefs`.
- Produces:

```kotlin
class Prefs(context: Context) { var baseUrl: String?; var apiToken: String?; val isConfigured: Boolean }
object Sync {
    fun requestSync(context: Context)                       // one-time expedited-ish sync
    fun schedulePeriodic(context: Context)                  // daily safety net + reminder
    suspend fun pushAll(dao: TransactionDao, client: ApiClient): Boolean  // pure logic; true = all done, false = retry needed
}
```

- [ ] **Step 1: Write the failing test** — the sync decision logic is extracted as `Sync.pushAll` so it tests without WorkManager:

```kotlin
package com.ngigi.wallet.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import com.ngigi.wallet.data.TransactionEntity
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SyncLogicTest {
    private lateinit var db: AppDb
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        server = MockWebServer(); server.start()
    }

    @After
    fun tearDown() { db.close(); server.shutdown() }

    private fun client() = ApiClient(server.url("/").toString().trimEnd('/'), "tok")

    private fun tagged(txnId: String) = TransactionEntity(
        txnId = txnId, amount = 10.0, direction = "out", source = "mpesa", counterparty = "X",
        dateTime = 1000L, balance = null, cost = 0.0, category = "food", reason = null,
        status = Status.TAGGED, rawBody = "", createdAt = 0,
    )

    @Test
    fun successAndDuplicateBothMarkSynced() = runBlocking {
        val dao = db.dao()
        dao.insert(tagged("A")); dao.insert(tagged("B"))
        server.enqueue(MockResponse().setResponseCode(201).setBody("{}"))
        server.enqueue(MockResponse().setResponseCode(200).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertTrue(done)
        assertEquals(0, dao.unsynced().size)
    }

    @Test
    fun clientErrorSetsSyncErrorAndDoesNotRetry() = runBlocking {
        val dao = db.dao()
        val id = dao.insert(tagged("A"))
        server.enqueue(MockResponse().setResponseCode(400).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertTrue(done) // no retry: retrying a 400 won't help
        assertNotNull(dao.byId(id)!!.syncError)
        assertEquals(Status.TAGGED, dao.byId(id)!!.status)
    }

    @Test
    fun serverErrorRequestsRetryAndKeepsRow() = runBlocking {
        val dao = db.dao()
        dao.insert(tagged("A"))
        server.enqueue(MockResponse().setResponseCode(500).setBody("{}"))
        val done = Sync.pushAll(dao, client())
        assertFalse(done)
        assertEquals(1, dao.unsynced().size)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sync.SyncLogicTest"`
Expected: FAIL — `Sync.pushAll` missing.

- [ ] **Step 3: Implement**

`settings/Prefs.kt`:

```kotlin
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
```

`sync/Sync.kt` (replace stub):

```kotlin
package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.*
import com.ngigi.wallet.data.TransactionDao
import java.io.IOException
import java.util.concurrent.TimeUnit

object Sync {
    fun requestSync(context: Context) {
        val work = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("sync", ExistingWorkPolicy.APPEND_OR_REPLACE, work)
    }

    fun schedulePeriodic(context: Context) {
        val sync = PeriodicWorkRequestBuilder<SyncWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("sync-periodic", ExistingPeriodicWorkPolicy.KEEP, sync)
        val reminder = PeriodicWorkRequestBuilder<com.ngigi.wallet.reminder.ReminderWorker>(24, TimeUnit.HOURS)
            .setInitialDelay(com.ngigi.wallet.reminder.ReminderWorker.delayToNext8pmMillis(), TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("reminder", ExistingPeriodicWorkPolicy.KEEP, reminder)
    }

    /** Pushes all TAGGED rows. Returns false when a retry is warranted (network/5xx). */
    suspend fun pushAll(dao: TransactionDao, client: ApiClient): Boolean {
        var allDone = true
        for (row in dao.unsynced()) {
            try {
                when (client.post(Wire.toApi(row))) {
                    PostResult.CREATED, PostResult.DUPLICATE -> dao.markSynced(row.id)
                    PostResult.CLIENT_ERROR -> dao.setSyncError(row.id, "rejected by server")
                    PostResult.SERVER_ERROR -> allDone = false
                }
            } catch (e: IOException) {
                allDone = false
            }
        }
        return allDone
    }
}
```

`sync/SyncWorker.kt`:

```kotlin
package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.settings.Prefs

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()
        val dao = AppDb.get(applicationContext).dao()
        val client = ApiClient(prefs.baseUrl!!, prefs.apiToken!!)
        return if (Sync.pushAll(dao, client)) Result.success() else Result.retry()
    }
}
```

`reminder/ReminderWorker.kt`:

```kotlin
package com.ngigi.wallet.reminder

import android.content.Context
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.ngigi.wallet.MainActivity
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.notify.AndroidNotifier
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime

class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    companion object {
        const val NOTIFICATION_ID = -1000
        fun delayToNext8pmMillis(now: LocalDateTime = LocalDateTime.now()): Long {
            var next = now.toLocalDate().atTime(LocalTime.of(20, 0))
            if (!next.isAfter(now)) next = next.plusDays(1)
            return Duration.between(now, next).toMillis()
        }
    }

    override suspend fun doWork(): Result {
        val count = AppDb.get(applicationContext).dao().inboxCount()
        if (count > 0) {
            AndroidNotifier.ensureChannels(applicationContext)
            val pi = PendingIntent.getActivity(
                applicationContext, NOTIFICATION_ID,
                Intent(applicationContext, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE
            )
            val n = NotificationCompat.Builder(applicationContext, AndroidNotifier.CHANNEL_TX)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .setContentTitle("$count untagged transaction${if (count > 1) "s" else ""}")
                .setContentText("Tap to categorize them")
                .setContentIntent(pi).setAutoCancel(true).build()
            try { NotificationManagerCompat.from(applicationContext).notify(NOTIFICATION_ID, n) }
            catch (e: SecurityException) { /* permission revoked */ }
        }
        return Result.success()
    }
}
```

In `MainActivity.onCreate`, after `requestNeededPermissions()` add `Sync.schedulePeriodic(this)` (import `com.ngigi.wallet.sync.Sync`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest`
Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/ android/app/src/test/
git commit -m "feat: sync worker with retry semantics, prefs, daily reminder"
```

---

### Task 11: Settings screen + hydration

**Files:**
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/SettingsScreen.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/sync/HydrateWorker.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt` (mount screen)
- Test: `android/app/src/test/java/com/ngigi/wallet/sync/HydrateLogicTest.kt`

**Interfaces:**
- Consumes: `ApiClient.getAll`/`Wire.toEntity` (Task 9), `Prefs` (Task 10).
- Produces: `object Hydrate { fun request(context: Context); suspend fun pull(dao: TransactionDao, client: ApiClient): Int }` — returns inserted-row count.

- [ ] **Step 1: Write the failing test**

```kotlin
package com.ngigi.wallet.sync

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.Status
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class HydrateLogicTest {
    private lateinit var db: AppDb
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        server = MockWebServer(); server.start()
    }

    @After
    fun tearDown() { db.close(); server.shutdown() }

    @Test
    fun pullInsertsAsSyncedAndSkipsExisting() = runBlocking {
        val body = """[
            {"transaction_id":"L1","amount":100.0,"direction":"out","source":"mpesa","counterparty":"A",
             "date_time":"2026-08-31T10:00:00+03:00","balance":0.0,"cost":0.0,"category":"food","reason":""},
            {"transaction_id":"L2","amount":50.0,"direction":"out","source":"mpesa","counterparty":"B",
             "date_time":"2026-08-30T10:00:00+03:00","balance":0.0,"cost":0.0,"category":"travel","reason":""}
        ]"""
        server.enqueue(MockResponse().setResponseCode(200).setBody(body))
        server.enqueue(MockResponse().setResponseCode(200).setBody(body))
        val client = ApiClient(server.url("/").toString().trimEnd('/'), "tok")
        val dao = db.dao()

        assertEquals(2, Hydrate.pull(dao, client))
        assertEquals(0, Hydrate.pull(dao, client)) // second pull: all duplicates
        assertEquals(2, dao.count())
        assertEquals(0, dao.inboxCount())
        assertEquals(Status.SYNCED, dao.byId(1L)!!.status)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.sync.HydrateLogicTest"`
Expected: FAIL — `Hydrate` missing.

- [ ] **Step 3: Implement**

`sync/HydrateWorker.kt`:

```kotlin
package com.ngigi.wallet.sync

import android.content.Context
import androidx.work.*
import com.ngigi.wallet.data.AppDb
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.settings.Prefs
import java.io.IOException

object Hydrate {
    fun request(context: Context) {
        val work = OneTimeWorkRequestBuilder<HydrateWorker>()
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("hydrate", ExistingWorkPolicy.KEEP, work)
    }

    /** Pulls the full server history; inserts unseen rows as SYNCED. Returns inserted count. */
    suspend fun pull(dao: TransactionDao, client: ApiClient): Int {
        var inserted = 0
        for (tx in client.getAll()) {
            if (dao.insert(Wire.toEntity(tx)) != -1L) inserted++
        }
        return inserted
    }
}

class HydrateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = Prefs(applicationContext)
        if (!prefs.isConfigured) return Result.success()
        return try {
            Hydrate.pull(AppDb.get(applicationContext).dao(), ApiClient(prefs.baseUrl!!, prefs.apiToken!!))
            Result.success()
        } catch (e: IOException) {
            Result.retry()
        }
    }
}
```

`ui/SettingsScreen.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.settings.Prefs

@Composable
fun SettingsScreen(prefs: Prefs, onSaved: () -> Unit, onHydrate: () -> Unit) {
    var url by remember { mutableStateOf(prefs.baseUrl ?: "") }
    var token by remember { mutableStateOf(prefs.apiToken ?: "") }
    var savedMsg by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(url, { url = it }, label = { Text("Server URL (https://…)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(token, { token = it }, label = { Text("API token") }, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            prefs.baseUrl = url; prefs.apiToken = token
            savedMsg = "Saved"; onSaved()
        }, enabled = url.isNotBlank() && token.isNotBlank()) { Text("Save") }
        HorizontalDivider()
        Button(onClick = onHydrate, enabled = prefs.isConfigured) { Text("Sync history from server") }
        savedMsg?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}
```

In `MainActivity`, replace the Settings placeholder branch:

```kotlin
                            else -> SettingsScreen(
                                Prefs(this),
                                onSaved = { Sync.requestSync(this) },
                                onHydrate = { Hydrate.request(this) },
                            )
```

with imports `com.ngigi.wallet.settings.Prefs`, `com.ngigi.wallet.sync.Hydrate`, `com.ngigi.wallet.ui.SettingsScreen`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug`
Expected: PASS + BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/ android/app/src/test/
git commit -m "feat: settings screen and server history hydration"
```

---

### Task 12: Stats — queries and screen

**Files:**
- Modify: `android/app/src/main/java/com/ngigi/wallet/data/TransactionDao.kt`
- Create: `android/app/src/main/java/com/ngigi/wallet/ui/StatsScreen.kt`
- Modify: `android/app/src/main/java/com/ngigi/wallet/MainActivity.kt` (mount screen)
- Test: `android/app/src/test/java/com/ngigi/wallet/data/StatsDaoTest.kt`

**Interfaces:**
- Produces (DAO additions):

```kotlin
data class Totals(val moneyIn: Double, val moneyOut: Double)
data class NamedTotal(val name: String, val total: Double)
suspend fun totals(from: Long, to: Long): Totals
suspend fun categoryTotals(from: Long, to: Long): List<NamedTotal>
suspend fun topDays(from: Long, to: Long): List<NamedTotal>       // name = "YYYY-MM-DD"
suspend fun biggestExpenses(from: Long, to: Long): List<TransactionEntity>
suspend fun topCounterparties(from: Long, to: Long): List<NamedTotal>
```

- [ ] **Step 1: Write the failing test**

```kotlin
package com.ngigi.wallet.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDateTime
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StatsDaoTest {
    private lateinit var db: AppDb
    private lateinit var dao: TransactionDao

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AppDb::class.java)
            .allowMainThreadQueries().build()
        dao = db.dao()
    }

    @After
    fun tearDown() = db.close()

    private fun ms(day: Int, hour: Int) =
        LocalDateTime.of(2026, 8, day, hour, 0).toInstant(ZoneOffset.UTC).toEpochMilli()

    private fun row(txnId: String, amount: Double, direction: String, category: String?,
                    counterparty: String, at: Long, cost: Double = 0.0) = TransactionEntity(
        txnId = txnId, amount = amount, direction = direction, source = "mpesa",
        counterparty = counterparty, dateTime = at, balance = null, cost = cost,
        category = category, reason = null, status = Status.SYNCED, rawBody = "", createdAt = 0,
    )

    @Test
    fun totalsExcludeTransfersAndCountFees() = runBlocking {
        dao.insert(row("A", 1000.0, "out", "food", "Shop", ms(10, 9), cost = 30.0))
        dao.insert(row("B", 500.0, "in", "income", "Boss", ms(11, 9)))
        dao.insert(row("C", 8000.0, "transfer", Categories.TRANSFER, "Pochi", ms(12, 9)))
        val t = dao.totals(ms(1, 0), ms(30, 23))
        assertEquals(500.0, t.moneyIn, 0.001)
        assertEquals(1030.0, t.moneyOut, 0.001)   // amount + fee, transfer excluded
    }

    @Test
    fun categoryTotalsSortedDesc() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "S1", ms(10, 9)))
        dao.insert(row("B", 900.0, "out", "travel", "S2", ms(10, 10)))
        dao.insert(row("C", 200.0, "out", "food", "S3", ms(10, 11)))
        val cats = dao.categoryTotals(ms(1, 0), ms(30, 23))
        assertEquals(listOf("travel", "food"), cats.map { it.name })
        assertEquals(900.0, cats[0].total, 0.001)
        assertEquals(300.0, cats[1].total, 0.001)
    }

    @Test
    fun topDaysGroupsByLocalDate() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "S", ms(10, 9)))
        dao.insert(row("B", 400.0, "out", "food", "S", ms(10, 18)))
        dao.insert(row("C", 50.0, "out", "food", "S", ms(11, 9)))
        val days = dao.topDays(ms(1, 0), ms(30, 23))
        assertEquals("2026-08-10", days[0].name)
        assertEquals(500.0, days[0].total, 0.001)
    }

    @Test
    fun biggestAndCounterparties() = runBlocking {
        dao.insert(row("A", 100.0, "out", "food", "Alice", ms(10, 9)))
        dao.insert(row("B", 900.0, "out", "travel", "Bob", ms(10, 10)))
        dao.insert(row("C", 200.0, "out", "food", "Bob", ms(10, 11)))
        assertEquals("B", dao.biggestExpenses(ms(1, 0), ms(30, 23)).first().txnId)
        val cp = dao.topCounterparties(ms(1, 0), ms(30, 23))
        assertEquals("Bob", cp[0].name)
        assertEquals(1100.0, cp[0].total, 0.001)
    }
}
```

Note: `topDays` uses SQLite `localtime`. The test timestamps sit mid-day (9:00–18:00 UTC) so the calendar date is identical in any zone between UTC-5 and UTC+5 — deterministic on this machine (Africa/Nairobi, UTC+3) without timezone pinning.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "com.ngigi.wallet.data.StatsDaoTest"`
Expected: FAIL — DAO methods missing.

- [ ] **Step 3: Implement** — append to `TransactionDao.kt` (and the two data classes at file top-level):

```kotlin
data class Totals(val moneyIn: Double, val moneyOut: Double)
data class NamedTotal(val name: String, val total: Double)
```

```kotlin
    @Query("""SELECT
                COALESCE(SUM(CASE WHEN direction = 'in' THEN amount END), 0) AS moneyIn,
                COALESCE(SUM(CASE WHEN direction = 'out' THEN amount + cost END), 0) AS moneyOut
              FROM transactions
              WHERE date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'""")
    suspend fun totals(from: Long, to: Long): Totals

    @Query("""SELECT category AS name, SUM(amount + cost) AS total FROM transactions
              WHERE direction = 'out' AND category IS NOT NULL
                AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY category ORDER BY total DESC""")
    suspend fun categoryTotals(from: Long, to: Long): List<NamedTotal>

    @Query("""SELECT strftime('%Y-%m-%d', date_time / 1000, 'unixepoch', 'localtime') AS name,
                     SUM(amount + cost) AS total FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY name ORDER BY total DESC LIMIT 5""")
    suspend fun topDays(from: Long, to: Long): List<NamedTotal>

    @Query("""SELECT * FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              ORDER BY amount DESC LIMIT 5""")
    suspend fun biggestExpenses(from: Long, to: Long): List<TransactionEntity>

    @Query("""SELECT counterparty AS name, SUM(amount) AS total FROM transactions
              WHERE direction = 'out' AND date_time BETWEEN :from AND :to AND status != '${Status.PARSE_FAILED}'
              GROUP BY counterparty ORDER BY total DESC LIMIT 5""")
    suspend fun topCounterparties(from: Long, to: Long): List<NamedTotal>
```

`ui/StatsScreen.kt`:

```kotlin
package com.ngigi.wallet.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.ngigi.wallet.data.NamedTotal
import com.ngigi.wallet.data.TransactionDao
import com.ngigi.wallet.data.TransactionEntity
import com.ngigi.wallet.data.Totals
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

enum class Period { WEEK, MONTH, YEAR }

private fun range(period: Period, ref: LocalDate, zone: ZoneId): Pair<Long, Long> {
    val (start, end) = when (period) {
        Period.WEEK -> ref.with(DayOfWeek.MONDAY).let { it to it.plusDays(7) }
        Period.MONTH -> ref.withDayOfMonth(1).let { it to it.plusMonths(1) }
        Period.YEAR -> ref.withDayOfYear(1).let { it to it.plusYears(1) }
    }
    return start.atStartOfDay(zone).toInstant().toEpochMilli() to
        end.atStartOfDay(zone).toInstant().toEpochMilli() - 1
}

private fun label(period: Period, ref: LocalDate): String = when (period) {
    Period.WEEK -> "Week of " + ref.with(DayOfWeek.MONDAY).format(DateTimeFormatter.ofPattern("d MMM uuuu"))
    Period.MONTH -> ref.format(DateTimeFormatter.ofPattern("MMMM uuuu"))
    Period.YEAR -> ref.year.toString()
}

private fun step(period: Period, ref: LocalDate, dir: Long): LocalDate = when (period) {
    Period.WEEK -> ref.plusWeeks(dir)
    Period.MONTH -> ref.plusMonths(dir)
    Period.YEAR -> ref.plusYears(dir)
}

@Composable
fun StatsScreen(dao: TransactionDao) {
    var period by remember { mutableStateOf(Period.MONTH) }
    var ref by remember { mutableStateOf(LocalDate.now()) }
    var totals by remember { mutableStateOf(Totals(0.0, 0.0)) }
    var cats by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var days by remember { mutableStateOf(emptyList<NamedTotal>()) }
    var biggest by remember { mutableStateOf(emptyList<TransactionEntity>()) }
    var people by remember { mutableStateOf(emptyList<NamedTotal>()) }

    LaunchedEffect(period, ref) {
        val (from, to) = range(period, ref, ZoneId.systemDefault())
        totals = dao.totals(from, to)
        cats = dao.categoryTotals(from, to)
        days = dao.topDays(from, to)
        biggest = dao.biggestExpenses(from, to)
        people = dao.topCounterparties(from, to)
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TabRow(selectedTabIndex = period.ordinal) {
            Period.entries.forEach { p ->
                Tab(selected = period == p, onClick = { period = p; ref = LocalDate.now() },
                    text = { Text(p.name.lowercase().replaceFirstChar { it.uppercase() }) })
            }
        }
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            TextButton({ ref = step(period, ref, -1) }) { Text("◀") }
            Text(label(period, ref), style = MaterialTheme.typography.titleMedium)
            TextButton({ ref = step(period, ref, 1) }) { Text("▶") }
        }
        Row(horizontalArrangement = Arrangement.SpaceEvenly, modifier = Modifier.fillMaxWidth()) {
            StatCell("In", totals.moneyIn); StatCell("Out", totals.moneyOut)
            StatCell("Net", totals.moneyIn - totals.moneyOut)
        }
        Section("By category", cats.map { it.name to it.total })
        Section("Top spending days", days.map { it.name to it.total })
        Section("Biggest expenses", biggest.map { "${it.counterparty} (${it.category ?: "?"})" to it.amount })
        Section("Top counterparties", people.map { it.name to it.total })
    }
}

@Composable
private fun StatCell(label: String, value: Double) {
    Column(horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text("Ksh %,.0f".format(value), style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun Section(title: String, rows: List<Pair<String, Double>>) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        if (rows.isEmpty()) Text("No data", style = MaterialTheme.typography.bodySmall)
        rows.forEach { (name, total) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(name, Modifier.weight(1f), maxLines = 1)
                Text("Ksh %,.0f".format(total))
            }
        }
    }
}
```

In `MainActivity`, replace the Stats placeholder branch with `1 -> StatsScreen(dao)` (import `com.ngigi.wallet.ui.StatsScreen`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest && ./gradlew :app:assembleDebug`
Expected: PASS + BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/ android/app/src/test/
git commit -m "feat: stats screen with period navigation and aggregates"
```

---

### Task 13: End-to-end — emulator, then real device (GUIDED — run with the user)

**Files:** none (verification only).

- [ ] **Step 1: Emulator smoke test**

```bash
ls ~/Android/Sdk/system-images/android-34/        # discover the installed image tag (e.g. google_apis/x86_64)
~/Android/Sdk/cmdline-tools/latest/bin/avdmanager create avd -n wallet-test \
  -k "system-images;android-34;<tag>;x86_64" --force
~/Android/Sdk/emulator/emulator -avd wallet-test -no-snapshot -no-audio &
adb wait-for-device
cd android && ./gradlew :app:installDebug
adb shell am start -n com.ngigi.wallet/.MainActivity
# grant permissions in the UI (or: adb shell pm grant com.ngigi.wallet android.permission.RECEIVE_SMS
#                                    adb shell pm grant com.ngigi.wallet android.permission.POST_NOTIFICATIONS)
adb emu sms send MPESA "TID60759AQ Confirmed. Ksh300.00 sent to Jane Wanjiku on 13/9/26 at 9:24 AM. New M-PESA balance is Ksh1,761.18. Transaction cost, Ksh7.00."
```

Verify: heads-up notification appears with two category buttons + More…; tapping a category clears it; the row leaves the Inbox. Send a Pochi transfer body: no notification, and (with Settings unconfigured) the row is TAGGED as `transfer`. Send a promo body: nothing happens.

- [ ] **Step 2: Install on the real phone**

Phone: CPH2799 over wireless ADB (pairing persists; user toggles Wireless debugging on, then `adb connect <ip>:<port>` — discover the port with `avahi-browse -rpt _adb-tls-connect._tcp`).

```bash
cd android && ./gradlew :app:assembleDebug
adb -s <ip>:<port> install -r app/build/outputs/apk/debug/app-debug.apk
```

With the user, on the phone: open Wallet, grant both permissions, enter Server URL + API token in Settings, tap "Sync history from server", confirm Stats shows Discord-era data. **ColorOS note (OPPO/OnePlus):** in Settings → Battery, set Wallet to "Don't optimize"/allow auto-launch so the SMS receiver is never throttled.

- [ ] **Step 3: Live transaction test**

User sends themselves a small real M-PESA transaction (e.g. Ksh 1 airtime-free transfer to a friend and back). Verify: prompt within seconds of the SMS; tag it; confirm it lands on the server (`curl -s https://<domain>/api/transactions -H "Authorization: Bearer $TOKEN" | grep <txn_id>`) and in Discord's `!summary`.

- [ ] **Step 4: Commit any fixes found, then tag the milestone**

```bash
git commit -am "fix: e2e adjustments"   # only if changes were needed
```

---

## Self-review notes

- Spec coverage: §4.1 receiver+filter (Task 6), §4.2 parser inventory (Tasks 2-4), §4.3 schema + `sync_error` addition for §6's error badge (Task 5), §4.4 notification/2+More/TagActivity/transfer-skip (Tasks 6-7), §4.5 inbox + reminder (Tasks 8, 10), §4.6 stats incl. transfer exclusion (Task 12), §4.7 sync semantics (Task 10), §4.8 hydration (Task 11), §4.9 settings (Task 11), §7 testing (throughout + Task 13).
- Deviation from spec, intentional: `sync_error` column added to the Room schema (spec §6 requires an error badge; the spec's schema lacked a field to carry it).
- Type consistency: `Direction.wire`/`Source.wire` produce the exact API strings; `Wire.toApi` field names match the backend `TransactionJSON` byte-for-byte; `row_id` extra is used by both notification and inbox paths.
