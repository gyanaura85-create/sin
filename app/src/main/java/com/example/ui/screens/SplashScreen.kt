package com.example.ui.screens

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartDarkBlue
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
  onSplashFinished: () -> Unit,
  modifier: Modifier = Modifier
) {
  val skyBg = Color(0xFFEAF3FF)
  val greenAccent = Color(0xFF4CAF50)

  val transition = rememberInfiniteTransition(label = "pulse")
  val scale by transition.animateFloat(
    initialValue = 0.95f,
    targetValue = 1.05f,
    animationSpec = infiniteRepeatable(
      animation = tween(1200, easing = FastOutSlowInEasing),
      repeatMode = RepeatMode.Reverse
    ),
    label = "scale"
  )

  LaunchedEffect(Unit) {
    delay(2400L)
    onSplashFinished()
  }

  Box(
    modifier = modifier
      .fillMaxSize()
      .background(skyBg)
      .testTag("splash_screen")
  ) {
    // Top-left angled geometric decoration
    Box(
      modifier = Modifier
        .offset(x = (-120).dp, y = (-90).dp)
        .size(width = 360.dp, height = 180.dp)
        .rotate(-30f)
        .background(NearKartDarkBlue)
    )
    Box(
      modifier = Modifier
        .offset(x = (-90).dp, y = (-70).dp)
        .size(width = 400.dp, height = 10.dp)
        .rotate(-30f)
        .background(greenAccent)
    )

    // Bottom-right angled geometric decoration
    Box(
      modifier = Modifier
        .align(Alignment.BottomEnd)
        .offset(x = 120.dp, y = 90.dp)
        .size(width = 360.dp, height = 180.dp)
        .rotate(-30f)
        .background(NearKartDarkBlue)
    )
    Box(
      modifier = Modifier
        .align(Alignment.BottomEnd)
        .offset(x = 90.dp, y = 70.dp)
        .size(width = 400.dp, height = 10.dp)
        .rotate(-30f)
        .background(greenAccent)
    )

    // Center Logo & Branding
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center,
      modifier = Modifier.fillMaxSize()
    ) {
      Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.Center
      ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          // Arch handle
          Box(
            modifier = Modifier
              .size(width = 38.dp, height = 28.dp)
              .border(
                width = 6.dp,
                color = Color(0xFF2F6FC9),
                shape = RoundedCornerShape(topStart = 19.dp, topEnd = 19.dp)
              )
          )
          // Bag box with 'N'
          Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
              .offset(y = (-6).dp)
              .size(width = 82.dp, height = 88.dp)
              .background(Color(0xFF2F6FC9), RoundedCornerShape(14.dp))
              .border(3.dp, Color(0xFF9FC2F2), RoundedCornerShape(14.dp))
          ) {
            Text(
              text = "N",
              color = Color.White,
              fontSize = 54.sp,
              fontWeight = FontWeight.Black
            )
          }
        }
        Spacer(modifier = Modifier.width(4.dp))
        Text(
          text = "🛒",
          fontSize = 38.sp,
          modifier = Modifier.offset(y = (-6).dp)
        )
      }

      Spacer(modifier = Modifier.height(14.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
          text = "Near",
          fontSize = 44.sp,
          fontWeight = FontWeight.Black,
          color = NearKartDarkBlue
        )
        Text(
          text = "Kart",
          fontSize = 44.sp,
          fontWeight = FontWeight.Black,
          color = Color(0xFF3AA83F)
        )
      }

      Spacer(modifier = Modifier.height(6.dp))
      Text(
        text = "Your neighbourhood, your marketplace.",
        fontSize = 15.sp,
        fontWeight = FontWeight.SemiBold,
        color = NearKartDarkBlue
      )

      Spacer(modifier = Modifier.height(56.dp))
      CircularProgressIndicator(
        color = NearKartBlue,
        strokeWidth = 3.dp,
        modifier = Modifier.size(36.dp)
      )
      Spacer(modifier = Modifier.height(12.dp))
      Text(
        text = "Loading...",
        color = NearKartDarkBlue,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold
      )
    }
  }
}
