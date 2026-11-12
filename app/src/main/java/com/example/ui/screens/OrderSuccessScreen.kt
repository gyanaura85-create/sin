package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.data.model.Order
import com.example.ui.components.NearKartTag
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartGreen
import com.example.ui.theme.NearKartGreenBg
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute

@Composable
fun OrderSuccessScreen(
  order: Order,
  lang: String,
  onViewOrders: () -> Unit,
  onGoHome: () -> Unit,
  modifier: Modifier = Modifier
) {
  val scrollState = rememberScrollState()

  Column(
    horizontalAlignment = Alignment.CenterHorizontally,
    modifier = modifier
      .fillMaxSize()
      .background(NearKartBg)
      .statusBarsPadding()
      .padding(24.dp)
      .verticalScroll(scrollState)
      .testTag("order_success_screen")
  ) {
    Spacer(modifier = Modifier.height(24.dp))

    // Green concentric checkmark circles
    Box(
      contentAlignment = Alignment.Center,
      modifier = Modifier
        .size(110.dp)
        .clip(CircleShape)
        .background(NearKartGreenBg)
    ) {
      Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
          .size(76.dp)
          .clip(CircleShape)
          .background(NearKartGreen)
      ) {
        Text(
          text = "✓",
          color = Color.White,
          fontSize = 42.sp,
          fontWeight = FontWeight.ExtraBold
        )
      }
    }

    Spacer(modifier = Modifier.height(20.dp))
    Text(
      text = "${Localization.tr("Order placed", lang)}\n${Localization.tr("successfully!", lang)}",
      fontSize = 26.sp,
      fontWeight = FontWeight.ExtraBold,
      color = NearKartInk,
      textAlign = TextAlign.Center,
      lineHeight = 32.sp
    )

    Spacer(modifier = Modifier.height(8.dp))
    Text(
      text = "${order.shopName ?: "Shop"} ${Localization.tr("will confirm within 10 minutes", lang)}",
      fontSize = 14.sp,
      color = NearKartMute,
      textAlign = TextAlign.Center
    )

    Spacer(modifier = Modifier.height(24.dp))
    // Summary Card
    Card(
      colors = CardDefaults.cardColors(containerColor = Color.White),
      shape = RoundedCornerShape(18.dp),
      border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
      modifier = Modifier.fillMaxWidth()
    ) {
      Column(modifier = Modifier.padding(16.dp)) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
          modifier = Modifier.fillMaxWidth()
        ) {
          Text(
            text = if (order.orderNumber != null) "#${order.orderNumber}" else "#NK${order.id.takeLast(4).uppercase()}",
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            color = NearKartInk
          )
          NearKartTag(text = Localization.tr("New", lang), type = "blue")
        }

        Spacer(modifier = Modifier.height(8.dp))
        Text(
          text = order.orderItems.joinToString(", ") { "${it.name} ${Localization.formatQty(it.qty, it.unit)}" },
          fontSize = 13.sp,
          color = NearKartInk,
          lineHeight = 18.sp
        )

        Spacer(modifier = Modifier.height(10.dp))
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
          modifier = Modifier.fillMaxWidth()
        ) {
          Text(
            text = "${if (order.isPickup) Localization.tr("Pickup", lang) else Localization.tr("Home Delivery", lang)} • ${if (order.isUpi) "UPI" else Localization.tr("Cash on Delivery", lang)}",
            fontSize = 12.sp,
            color = NearKartMute
          )
          Text(
            text = Localization.formatMoney(order.total),
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            color = NearKartGreen
          )
        }

        if (order.isUpi && !order.utrNumber.isNullOrBlank()) {
          Spacer(modifier = Modifier.height(8.dp))
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = Localization.tr("UTR Number", lang),
              fontSize = 12.sp,
              color = NearKartMute
            )
            Text(
              text = order.utrNumber,
              fontSize = 13.sp,
              fontWeight = FontWeight.Bold,
              color = NearKartInk
            )
          }
          Text(
            text = Localization.tr("UPI payment is confirmed only after the shop verifies it.", lang),
            fontSize = 11.sp,
            color = NearKartMute,
            modifier = Modifier.padding(top = 4.dp)
          )
        }
      }
    }

    Spacer(modifier = Modifier.height(28.dp))
    Button(
      onClick = onViewOrders,
      colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
      shape = RoundedCornerShape(14.dp),
      modifier = Modifier
        .fillMaxWidth()
        .height(52.dp)
        .testTag("view_my_orders_success_button")
    ) {
      Text(
        text = Localization.tr("View my orders", lang),
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp
      )
    }

    Spacer(modifier = Modifier.height(12.dp))
    OutlinedButton(
      onClick = onGoHome,
      border = androidx.compose.foundation.BorderStroke(1.5.dp, NearKartBlue),
      shape = RoundedCornerShape(14.dp),
      modifier = Modifier
        .fillMaxWidth()
        .height(52.dp)
        .testTag("go_to_home_success_button")
    ) {
      Text(
        text = Localization.tr("Go to Home", lang),
        color = NearKartBlue,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp
      )
    }
    Spacer(modifier = Modifier.height(24.dp))
  }
}
