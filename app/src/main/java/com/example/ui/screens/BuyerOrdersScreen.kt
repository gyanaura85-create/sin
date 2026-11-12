package com.example.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import com.example.ui.theme.NearKartRed

@Composable
fun BuyerOrdersScreen(
  orders: List<Order>,
  lang: String,
  onReorder: (Order) -> Unit,
  onCancelOrder: (String) -> Unit,
  onNeedLogin: () -> Unit,
  isLoggedIn: Boolean,
  modifier: Modifier = Modifier
) {
  var selectedOrderForTracking by remember { mutableStateOf<Order?>(null) }

  if (selectedOrderForTracking != null) {
    OrderTrackingView(
      order = selectedOrderForTracking!!,
      lang = lang,
      onBack = { selectedOrderForTracking = null },
      onReorder = {
        onReorder(selectedOrderForTracking!!)
        selectedOrderForTracking = null
      },
      onCancel = {
        onCancelOrder(selectedOrderForTracking!!.id)
        selectedOrderForTracking = null
      }
    )
    return
  }

  Box(modifier = modifier.fillMaxSize().background(NearKartBg)) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
      // Header
      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(NearKartBlue)
            .statusBarsPadding()
            .padding(16.dp)
        ) {
          Column {
            Text(
              text = Localization.tr("My Orders", lang),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 24.sp,
              color = Color.White
            )
            Text(
              text = Localization.tr("Track live orders and view past purchases", lang),
              color = Color(0xFFCFDCF7),
              fontSize = 13.sp,
              modifier = Modifier.padding(top = 2.dp)
            )
          }
        }
      }

      if (!isLoggedIn && orders.isEmpty()) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier
              .fillMaxWidth()
              .padding(16.dp)
          ) {
            Column(
              horizontalAlignment = Alignment.CenterHorizontally,
              modifier = Modifier.padding(20.dp)
            ) {
              Text(
                text = Localization.tr("Login or sign up to continue", lang),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = NearKartInk
              )
              Spacer(modifier = Modifier.height(14.dp))
              Button(
                onClick = onNeedLogin,
                colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
                shape = RoundedCornerShape(12.dp)
              ) {
                Text(Localization.tr("Login", lang), fontWeight = FontWeight.Bold)
              }
            }
          }
        }
      } else if (orders.isEmpty()) {
        item {
          Text(
            text = Localization.tr("No orders yet.", lang),
            color = NearKartMute,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(40.dp)
          )
        }
      } else {
        items(orders) { order ->
          val firstItem = order.orderItems.firstOrNull()
          val moreCount = if (order.orderItems.size > 1) order.orderItems.size - 1 else 0

          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 6.dp)
              .clickable { selectedOrderForTracking = order }
              .testTag("order_item_card_${order.id}")
          ) {
            Column(modifier = Modifier.padding(14.dp)) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
              ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                  Text(
                    text = if (order.orderNumber != null) "#${order.orderNumber}" else "#NK${order.id.takeLast(4).uppercase()}",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp,
                    color = NearKartInk
                  )
                  Spacer(modifier = Modifier.width(8.dp))
                  NearKartTag(
                    text = Localization.tr(order.status.replace("_", " ").replaceFirstChar { it.uppercase() }, lang),
                    type = when (order.status) {
                      "delivered" -> "green"
                      "cancelled" -> "red"
                      else -> "blue"
                    },
                    isSmall = true
                  )
                }

                Text(
                  text = Localization.formatMoney(order.total),
                  fontWeight = FontWeight.ExtraBold,
                  fontSize = 15.sp,
                  color = NearKartGreen
                )
              }

              Spacer(modifier = Modifier.height(8.dp))
              Text(
                text = "${firstItem?.name ?: "Order"}${if (moreCount > 0) " + $moreCount more" else ""}",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = NearKartInk
              )
              Text(
                text = order.shopName ?: "Shop",
                fontSize = 12.sp,
                color = NearKartMute
              )

              Spacer(modifier = Modifier.height(8.dp))
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(
                  text = "${if (order.isPickup) Localization.tr("Pickup", lang) else Localization.tr("Home Delivery", lang)} • ${if (order.isUpi) "UPI" else "COD"}",
                  fontSize = 11.sp,
                  color = NearKartMute
                )
                Text(
                  text = "${Localization.tr("View Details", lang)} →",
                  color = NearKartBlue,
                  fontWeight = FontWeight.Bold,
                  fontSize = 12.sp
                )
              }
            }
          }
        }
      }

      item {
        Spacer(modifier = Modifier.height(80.dp))
      }
    }
  }
}

@Composable
fun OrderTrackingView(
  order: Order,
  lang: String,
  onBack: () -> Unit,
  onReorder: () -> Unit,
  onCancel: () -> Unit
) {
  val context = LocalContext.current
  var showInvoiceDialog by remember { mutableStateOf(false) }

  val flowSteps = if (order.isPickup) {
    listOf(
      "new" to ("Order Placed" to "Your order has been placed"),
      "accepted" to ("Order Accepted" to "The shop accepted your order"),
      "preparing" to ("Preparing" to "Seller is preparing your order"),
      "ready" to ("Ready" to "Your order is ready for pickup"),
      "delivered" to ("Delivered" to "Order picked up successfully")
    )
  } else {
    listOf(
      "new" to ("Order Placed" to "Your order has been placed"),
      "accepted" to ("Order Accepted" to "The shop accepted your order"),
      "preparing" to ("Preparing" to "Seller is preparing your order"),
      "on_the_way" to ("Out for Delivery" to "Your order is on the way"),
      "delivered" to ("Delivered" to "Your order has been delivered")
    )
  }

  val currentStepIndex = flowSteps.indexOfFirst { it.first == order.status }.let { if (it == -1) 0 else it }
  val isCancelled = order.status == "cancelled"

  Box(modifier = Modifier.fillMaxSize().background(NearKartBg)) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
      // Header
      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(NearKartBlue)
            .statusBarsPadding()
            .padding(16.dp)
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              IconButton(onClick = onBack) {
                Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
              }
              Spacer(modifier = Modifier.width(6.dp))
              Column {
                Text(
                  text = Localization.tr("My Order", lang),
                  fontWeight = FontWeight.ExtraBold,
                  fontSize = 20.sp,
                  color = Color.White
                )
                Text(
                  text = "${if (order.orderNumber != null) "#${order.orderNumber}" else "#NK${order.id.takeLast(4).uppercase()}"} • ${order.shopName ?: ""}",
                  color = Color(0xFFCFDCF7),
                  fontSize = 12.sp
                )
              }
            }

            if (!order.shopPhone.isNullOrBlank()) {
              IconButton(onClick = {
                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${order.shopPhone}"))
                context.startActivity(intent)
              }) {
                Icon(imageVector = Icons.Default.Call, contentDescription = "Call", tint = Color.White)
              }
            }
          }
        }
      }

      // Live Tracking Stepper Card
      item {
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(18.dp),
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
          Column(modifier = Modifier.padding(16.dp)) {
            Text(
              text = Localization.tr("Order Status", lang),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 16.sp,
              color = NearKartInk
            )
            Spacer(modifier = Modifier.height(14.dp))

            if (isCancelled) {
              NearKartTag(text = Localization.tr("Order cancelled", lang), type = "red")
              order.cancelReason?.let {
                Text(
                  text = it,
                  color = NearKartRed,
                  fontSize = 13.sp,
                  modifier = Modifier.padding(top = 8.dp)
                )
              }
            } else {
              flowSteps.forEachIndexed { index, (key, stepData) ->
                val (title, description) = stepData
                val isDone = index <= currentStepIndex
                val isCurrent = index == currentStepIndex
                val isLast = index == flowSteps.size - 1

                Row(modifier = Modifier.fillMaxWidth()) {
                  Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                      contentAlignment = Alignment.Center,
                      modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .background(if (isDone) NearKartGreen else Color.White)
                        .border(
                          2.dp,
                          if (isDone) NearKartGreen else if (isCurrent) NearKartBlue else NearKartLine,
                          CircleShape
                        )
                    ) {
                      if (isDone) {
                        Text("✓", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                      }
                    }

                    if (!isLast) {
                      Box(
                        modifier = Modifier
                          .width(2.dp)
                          .height(34.dp)
                          .background(if (index < currentStepIndex) NearKartGreen else NearKartLine)
                      )
                    }
                  }

                  Spacer(modifier = Modifier.width(12.dp))
                  Column(modifier = Modifier.padding(bottom = if (isLast) 0.dp else 12.dp)) {
                    Text(
                      text = Localization.tr(title, lang),
                      fontWeight = if (isCurrent) FontWeight.ExtraBold else FontWeight.Bold,
                      fontSize = 14.sp,
                      color = if (isCurrent) NearKartBlue else NearKartInk
                    )
                    Text(
                      text = Localization.tr(description, lang),
                      fontSize = 12.sp,
                      color = NearKartMute
                    )
                  }
                }
              }
            }
          }
        }
      }

      // Delivery Information
      item {
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(18.dp),
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 6.dp)
        ) {
          Column(modifier = Modifier.padding(16.dp)) {
            Text(
              text = Localization.tr("Delivery Information", lang),
              fontWeight = FontWeight.Bold,
              fontSize = 15.sp,
              color = NearKartInk
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
              text = if (order.isPickup) "🏪 ${Localization.tr("Pickup from shop", lang)}" else "🏠 ${Localization.tr("Home Delivery", lang)}",
              color = NearKartGreen,
              fontWeight = FontWeight.Bold,
              fontSize = 14.sp
            )
            Text(
              text = "${order.customerName}\n${order.customerAddress}",
              fontSize = 13.sp,
              color = NearKartInk,
              lineHeight = 18.sp,
              modifier = Modifier.padding(top = 4.dp)
            )

            if (!order.isPickup && order.customerAddress.isNotBlank()) {
              Spacer(modifier = Modifier.height(8.dp))
              Text(
                text = Localization.tr("View on Map", lang),
                color = NearKartBlue,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier.clickable {
                  val mapIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://maps.google.com/?q=${Uri.encode(order.customerAddress)}"))
                  context.startActivity(mapIntent)
                }
              )
            }
          }
        }
      }

      // Order Items & Bill Breakdown
      item {
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(18.dp),
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 6.dp)
        ) {
          Column(modifier = Modifier.padding(16.dp)) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.SpaceBetween,
              modifier = Modifier.fillMaxWidth()
            ) {
              Text(
                text = Localization.tr("Order Summary", lang),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = NearKartInk
              )
              Text(
                text = Localization.tr("View Bill / Invoice", lang),
                color = NearKartBlue,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.clickable { showInvoiceDialog = true }
              )
            }

            Spacer(modifier = Modifier.height(10.dp))
            order.orderItems.forEach { item ->
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier
                  .fillMaxWidth()
                  .padding(vertical = 4.dp)
              ) {
                Text(
                  text = "${item.name} • ${Localization.formatQty(item.qty, item.unit)}",
                  fontSize = 13.sp,
                  color = NearKartInk
                )
                Text(
                  text = Localization.formatMoney(item.price * item.qty),
                  fontSize = 13.sp,
                  fontWeight = FontWeight.Bold,
                  color = NearKartInk
                )
              }
            }

            Spacer(modifier = Modifier.height(6.dp))
            Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(NearKartLine))
            Spacer(modifier = Modifier.height(6.dp))

            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.SpaceBetween,
              modifier = Modifier.fillMaxWidth()
            ) {
              Text(text = Localization.tr("Delivery Charge", lang), fontSize = 12.sp, color = NearKartMute)
              Text(text = Localization.tr("Free", lang), color = NearKartGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.height(6.dp))
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.SpaceBetween,
              modifier = Modifier.fillMaxWidth()
            ) {
              Text(text = Localization.tr("Total Amount", lang), fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = NearKartInk)
              Text(text = Localization.formatMoney(order.total), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = NearKartGreen)
            }

            if (order.isUpi && !order.utrNumber.isNullOrBlank()) {
              Spacer(modifier = Modifier.height(6.dp))
              Text(
                text = "UPI UTR: ${order.utrNumber} • ${order.paymentStatus ?: "Pending verification"}",
                fontSize = 12.sp,
                color = NearKartMute
              )
            }
          }
        }
      }

      // Actions (Reorder / Cancel)
      item {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(
            onClick = onReorder,
            colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
              .fillMaxWidth()
              .height(50.dp)
              .testTag("reorder_button")
          ) {
            Text(Localization.tr("Reorder", lang), fontWeight = FontWeight.Bold, fontSize = 15.sp)
          }

          if (order.status == "new") {
            OutlinedButton(
              onClick = onCancel,
              border = androidx.compose.foundation.BorderStroke(1.dp, NearKartRed),
              shape = RoundedCornerShape(14.dp),
              modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .testTag("cancel_order_button")
            ) {
              Text(Localization.tr("Cancel order", lang), color = NearKartRed, fontWeight = FontWeight.Bold)
            }
          }
        }
      }

      item {
        Spacer(modifier = Modifier.height(40.dp))
      }
    }
  }

  // Invoice Dialog
  if (showInvoiceDialog) {
    AlertDialog(
      onDismissRequest = { showInvoiceDialog = false },
      title = {
        Text("NearKart Tax Invoice", fontWeight = FontWeight.Bold)
      },
      text = {
        Column {
          Text("Order: ${if (order.orderNumber != null) "#${order.orderNumber}" else order.id}")
          Text("Shop: ${order.shopName ?: "Shop"}")
          Text("Customer: ${order.customerName}")
          Spacer(modifier = Modifier.height(8.dp))
          order.orderItems.forEach {
            Text("${it.name} x ${Localization.formatQty(it.qty, it.unit)} = ${Localization.formatMoney(it.price * it.qty)}")
          }
          Spacer(modifier = Modifier.height(8.dp))
          Text("Total Paid: ${Localization.formatMoney(order.total)} (${if (order.isUpi) "UPI" else "Cash on Delivery"})", fontWeight = FontWeight.Bold)
        }
      },
      confirmButton = {
        TextButton(onClick = { showInvoiceDialog = false }) {
          Text("Close")
        }
      }
    )
  }
}
