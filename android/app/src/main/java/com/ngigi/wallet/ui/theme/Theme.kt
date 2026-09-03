package com.ngigi.wallet.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ngigi.wallet.R

val Sora = FontFamily(
    Font(R.font.sora, FontWeight.Light),
    Font(R.font.sora, FontWeight.Normal),
    Font(R.font.sora, FontWeight.Medium),
    Font(R.font.sora, FontWeight.SemiBold),
    Font(R.font.sora, FontWeight.Bold),
)

// Beyond the Material scheme: money directions, the gold accent, and the
// fixed per-category hues (validated for CVD separation and surface contrast).
data class WalletPalette(
    val moneyIn: Color,
    val moneyOut: Color,
    val gold: Color,
    val heroTop: Color,
    val heroBottom: Color,
    // The hero/canopy is deep green in BOTH themes, so its ink is fixed light.
    val onHero: Color = Color(0xFFF2FBF4),
    val onHeroDim: Color = Color(0xFFBFE3CC),
    val onHeroIn: Color = Color(0xFF9FE3BE),
    val onHeroOut: Color = Color(0xFFFFC7AE),
    val categories: Map<String, Color>,
    val categoryFallback: Color,
) {
    fun category(name: String?): Color = categories[name] ?: categoryFallback
    val heroBrush: Brush get() = Brush.linearGradient(listOf(heroTop, heroBottom))
}

private val CategoryColors = mapOf(
    "food" to Color(0xFFB02E0C),
    "travel" to Color(0xFF2B6CB0),
    "savings" to Color(0xFFC43A8A),
    "church" to Color(0xFF8B5CF6),
    "investments" to Color(0xFFAC8112),
    "income" to Color(0xFF1B7F4B),
    "transfer" to Color(0xFF607468),
)

val CategoryEmoji = mapOf(
    "food" to "🍛",
    "travel" to "🚌",
    "savings" to "🐖",
    "church" to "⛪",
    "investments" to "📈",
    "income" to "💰",
    "transfer" to "🔁",
)

fun categoryEmoji(name: String?): String = CategoryEmoji[name] ?: "🧾"

private val LightPalette = WalletPalette(
    moneyIn = Color(0xFF1B7F4B),
    moneyOut = Color(0xFFB02E0C),
    gold = Color(0xFFAC8112),
    heroTop = Color(0xFF0B4A33),
    heroBottom = Color(0xFF17966B),
    categories = CategoryColors,
    categoryFallback = Color(0xFF607468),
)

private val DarkPalette = LightPalette.copy(
    moneyIn = Color(0xFF4CAE78),
    moneyOut = Color(0xFFE06A3C),
    gold = Color(0xFFE3B341),
)

val LocalWalletPalette = staticCompositionLocalOf { LightPalette }

private val LightColors = lightColorScheme(
    primary = Color(0xFF0B4A33),
    onPrimary = Color(0xFFF2FBF4),
    primaryContainer = Color(0xFFCFE9D6),
    onPrimaryContainer = Color(0xFF08331F),
    secondary = Color(0xFF4A6355),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFDCE9DE),
    onSecondaryContainer = Color(0xFF23392C),
    tertiary = Color(0xFFAC8112),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFF4E3B2),
    onTertiaryContainer = Color(0xFF4A3705),
    background = Color(0xFFF4F7F2),
    onBackground = Color(0xFF1A2B21),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF1A2B21),
    surfaceVariant = Color(0xFFE4EDE3),
    onSurfaceVariant = Color(0xFF5B6E62),
    outline = Color(0xFFA9BCA9),
    outlineVariant = Color(0xFFD8E3D6),
    error = Color(0xFFB3261E),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFF9DEDC),
    onErrorContainer = Color(0xFF410E0B),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6ECFA0),
    onPrimary = Color(0xFF06301F),
    primaryContainer = Color(0xFF1D4632),
    onPrimaryContainer = Color(0xFFCFEDD9),
    secondary = Color(0xFF9DB3A4),
    onSecondary = Color(0xFF1B2B21),
    secondaryContainer = Color(0xFF2A3B30),
    onSecondaryContainer = Color(0xFFD5E4D8),
    tertiary = Color(0xFFE3B341),
    onTertiary = Color(0xFF3A2D05),
    tertiaryContainer = Color(0xFF574310),
    onTertiaryContainer = Color(0xFFF7E1AC),
    background = Color(0xFF0C1611),
    onBackground = Color(0xFFE4EFE6),
    surface = Color(0xFF142019),
    onSurface = Color(0xFFE4EFE6),
    surfaceVariant = Color(0xFF223228),
    onSurfaceVariant = Color(0xFF9DB3A4),
    outline = Color(0xFF48594E),
    outlineVariant = Color(0xFF2C3D32),
    error = Color(0xFFF2B8B5),
    onError = Color(0xFF601410),
    errorContainer = Color(0xFF8C1D18),
    onErrorContainer = Color(0xFFF9DEDC),
)

private fun soraTypography(): Typography {
    val base = Typography()
    fun sora(style: androidx.compose.ui.text.TextStyle, weight: FontWeight) =
        style.copy(fontFamily = Sora, fontWeight = weight)
    return Typography(
        displayLarge = sora(base.displayLarge, FontWeight.SemiBold).copy(letterSpacing = (-1).sp),
        displayMedium = sora(base.displayMedium, FontWeight.SemiBold).copy(letterSpacing = (-0.5).sp),
        displaySmall = sora(base.displaySmall, FontWeight.SemiBold),
        headlineLarge = sora(base.headlineLarge, FontWeight.SemiBold),
        headlineMedium = sora(base.headlineMedium, FontWeight.SemiBold),
        headlineSmall = sora(base.headlineSmall, FontWeight.SemiBold),
        titleLarge = sora(base.titleLarge, FontWeight.SemiBold),
        titleMedium = sora(base.titleMedium, FontWeight.SemiBold),
        titleSmall = sora(base.titleSmall, FontWeight.Medium),
        bodyLarge = sora(base.bodyLarge, FontWeight.Normal),
        bodyMedium = sora(base.bodyMedium, FontWeight.Normal),
        bodySmall = sora(base.bodySmall, FontWeight.Normal),
        labelLarge = sora(base.labelLarge, FontWeight.Medium),
        labelMedium = sora(base.labelMedium, FontWeight.Medium),
        labelSmall = sora(base.labelSmall, FontWeight.Medium),
    )
}

private val WalletShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun WalletTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    CompositionLocalProvider(LocalWalletPalette provides if (dark) DarkPalette else LightPalette) {
        MaterialTheme(
            colorScheme = if (dark) DarkColors else LightColors,
            typography = soraTypography(),
            shapes = WalletShapes,
            content = content,
        )
    }
}
