package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
  primary = NearKartBlue,
  onPrimary = Color.White,
  primaryContainer = NearKartBlueBg,
  onPrimaryContainer = NearKartInk,
  secondary = NearKartGreen,
  onSecondary = Color.White,
  secondaryContainer = NearKartGreenBg,
  onSecondaryContainer = NearKartDarkGreen,
  tertiary = NearKartLime,
  onTertiary = NearKartInk,
  background = NearKartBg,
  onBackground = NearKartInk,
  surface = Color.White,
  onSurface = NearKartInk,
  surfaceVariant = NearKartBg,
  onSurfaceVariant = NearKartMute,
  outline = NearKartLine,
  error = NearKartRed,
  onError = Color.White,
  errorContainer = NearKartRedBg,
  onErrorContainer = NearKartRed
)

private val DarkColorScheme = darkColorScheme(
  primary = NearKartBlue,
  onPrimary = Color.White,
  primaryContainer = NearKartDarkBlue,
  onPrimaryContainer = Color.White,
  secondary = NearKartLime,
  onSecondary = NearKartInk,
  background = Color(0xFF0F172A),
  onBackground = Color.White,
  surface = Color(0xFF1E293B),
  onSurface = Color.White,
  outline = Color(0xFF334155),
  error = NearKartRed,
  onError = Color.White
)

@Composable
fun NearKartTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  content: @Composable () -> Unit
) {
  val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
  MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    content = content
  )
}
