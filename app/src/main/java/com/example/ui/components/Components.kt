package com.example.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.data.localization.Localization
import com.example.data.model.Product
import com.example.data.model.Shop
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartBlueBg
import com.example.ui.theme.NearKartDarkBlue
import com.example.ui.theme.NearKartDarkGreen
import com.example.ui.theme.NearKartGreen
import com.example.ui.theme.NearKartGreenBg
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLime
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import com.example.ui.theme.NearKartOrange
import com.example.ui.theme.NearKartRed
import com.example.ui.theme.NearKartRedBg
import com.example.ui.theme.NearKartYellowBg
import com.example.ui.theme.NearKartYellowText

@Composable
fun NearKartLogo(fontSize: Int = 22, modifier: Modifier = Modifier) {
  Row(verticalAlignment = Alignment.CenterVertically, modifier = modifier.testTag("nearkart_logo")) {
    Text(
      text = "Near",
      fontSize = fontSize.sp,
      fontWeight = FontWeight.ExtraBold,
      color = Color.White
    )
    Text(
      text = "Kart",
      fontSize = fontSize.sp,
      fontWeight = FontWeight.ExtraBold,
      color = NearKartLime
    )
  }
}

@Composable
fun NearKartTag(
  text: String,
  type: String = "green", // green, red, yellow, blue
  isSmall: Boolean = false,
  modifier: Modifier = Modifier
) {
  val (bgColor, txtColor) = when (type) {
    "red" -> NearKartRedBg to NearKartRed
    "yellow" -> NearKartYellowBg to NearKartYellowText
    "blue" -> NearKartBlueBg to NearKartBlue
    else -> NearKartGreenBg to NearKartDarkGreen
  }

  Surface(
    color = bgColor,
    shape = RoundedCornerShape(8.dp),
    modifier = modifier.testTag("tag_$text")
  ) {
    Text(
      text = text,
      color = txtColor,
      fontWeight = FontWeight.Bold,
      fontSize = if (isSmall) 10.sp else 12.sp,
      modifier = Modifier.padding(horizontal = if (isSmall) 6.dp else 10.dp, vertical = if (isSmall) 2.dp else 4.dp)
    )
  }
}

@Composable
fun PhotoAvatar(
  imageUrl: String?,
  fallbackName: String,
  size: Dp = 56.dp,
  isRound: Boolean = false,
  modifier: Modifier = Modifier
) {
  val shape = if (isRound) CircleShape else RoundedCornerShape(14.dp)
  Box(
    contentAlignment = Alignment.Center,
    modifier = modifier
      .size(size)
      .clip(shape)
      .background(NearKartBlueBg)
      .border(1.dp, NearKartLine, shape)
  ) {
    if (!imageUrl.isNullOrBlank()) {
      AsyncImage(
        model = imageUrl,
        contentDescription = fallbackName,
        contentScale = ContentScale.Crop,
        modifier = Modifier.size(size)
      )
    } else {
      Text(
        text = fallbackName.firstOrNull()?.uppercase() ?: "N",
        fontSize = (size.value / 2.3).sp,
        fontWeight = FontWeight.ExtraBold,
        color = NearKartBlue
      )
    }
  }
}

@Composable
fun ShopMiniCard(
  shop: Shop,
  lang: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  Card(
    colors = CardDefaults.cardColors(containerColor = Color.White),
    shape = RoundedCornerShape(16.dp),
    border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
    modifier = modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .testTag("shop_card_${shop.id}")
  ) {
    Column(modifier = Modifier.padding(10.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        PhotoAvatar(
          imageUrl = shop.photoUrl,
          fallbackName = shop.name,
          size = 48.dp,
          isRound = true
        )
        Spacer(modifier = Modifier.width(10.dp))
        Column(modifier = Modifier.weight(1f)) {
          Text(
            text = shop.name,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            color = NearKartInk,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = "${Localization.tr(shop.category, lang)} • ${shop.area}",
            fontSize = 11.sp,
            color = NearKartMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }
      }

      Spacer(modifier = Modifier.height(8.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
      ) {
        NearKartTag(
          text = if (shop.isOpen) Localization.tr("● Open", lang) else Localization.tr("● Closed", lang),
          type = if (shop.isOpen) "green" else "red",
          isSmall = true
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
          if (shop.rating > 0) {
            Text(
              text = "★ ${shop.rating}",
              fontSize = 11.sp,
              fontWeight = FontWeight.Bold,
              color = NearKartOrange
            )
            Spacer(modifier = Modifier.width(6.dp))
          }
          Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
              .size(22.dp)
              .clip(CircleShape)
              .background(NearKartBlueBg)
          ) {
            Icon(
              imageVector = Icons.Default.ArrowForward,
              contentDescription = "Open",
              tint = NearKartBlue,
              modifier = Modifier.size(12.dp)
            )
          }
        }
      }

      if (!shop.offer.isNullOrBlank()) {
        Spacer(modifier = Modifier.height(4.dp))
        Text(
          text = "🎁 ${shop.offer}",
          color = NearKartOrange,
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }
    }
  }
}

@Composable
fun ProductGridTile(
  product: Product,
  lang: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  val isOutOfStock = product.onlineQty <= 0.0

  Card(
    colors = CardDefaults.cardColors(containerColor = Color.White),
    shape = RoundedCornerShape(16.dp),
    border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
    modifier = modifier
      .fillMaxWidth()
      .clickable { onClick() }
      .testTag("product_tile_${product.id}")
  ) {
    Column(modifier = Modifier.padding(10.dp)) {
      Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
          .fillMaxWidth()
          .height(96.dp)
          .clip(RoundedCornerShape(12.dp))
          .background(NearKartBlueBg)
      ) {
        if (!product.imageUrl.isNullOrBlank()) {
          AsyncImage(
            model = product.imageUrl,
            contentDescription = product.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.size(96.dp)
          )
        } else {
          Text(
            text = product.name.firstOrNull()?.uppercase() ?: "P",
            fontSize = 32.sp,
            fontWeight = FontWeight.ExtraBold,
            color = NearKartBlue
          )
        }
        if (isOutOfStock) {
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .height(96.dp)
              .background(Color.Black.copy(alpha = 0.4f)),
            contentAlignment = Alignment.Center
          ) {
            NearKartTag(
              text = Localization.tr("Out of stock", lang),
              type = "red",
              isSmall = true
            )
          }
        }
      }

      Spacer(modifier = Modifier.height(8.dp))
      Text(
        text = product.name,
        fontWeight = FontWeight.Bold,
        fontSize = 13.sp,
        color = NearKartInk,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )

      Text(
        text = product.shopName ?: "",
        fontSize = 11.sp,
        color = NearKartMute,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )

      Spacer(modifier = Modifier.height(4.dp))
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
      ) {
        Column {
          Row(verticalAlignment = Alignment.Bottom) {
            Text(
              text = Localization.formatMoney(product.price),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 14.sp,
              color = NearKartGreen
            )
            Text(
              text = "/${product.unit}",
              fontSize = 11.sp,
              color = NearKartMute
            )
          }
          if (product.originalPrice != null && product.originalPrice > product.price) {
            Text(
              text = Localization.formatMoney(product.originalPrice),
              fontSize = 10.sp,
              color = NearKartMute,
              textDecoration = TextDecoration.LineThrough
            )
          }
        }

        Box(
          contentAlignment = Alignment.Center,
          modifier = Modifier
            .size(28.dp)
            .clip(CircleShape)
            .background(if (isOutOfStock) NearKartLine else NearKartBlue)
        ) {
          Text(
            text = "+",
            color = Color.White,
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp
          )
        }
      }
    }
  }
}

@Composable
fun LocalBusinessGradientCard(
  lang: String,
  onCreateShopClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  val gradientBrush = Brush.linearGradient(
    colors = listOf(Color(0xFFA8E6B0), Color(0xFF9ECEE8))
  )

  Card(
    shape = RoundedCornerShape(22.dp),
    modifier = modifier
      .fillMaxWidth()
      .testTag("local_business_card")
  ) {
    Box(
      modifier = Modifier
        .background(gradientBrush)
        .padding(18.dp)
    ) {
      Column {
        Text(text = "🏪", fontSize = 32.sp)
        Spacer(modifier = Modifier.height(6.dp))
        Text(
          text = Localization.tr("Establish Your Local Business Presence", lang),
          fontSize = 19.sp,
          fontWeight = FontWeight.ExtraBold,
          color = NearKartInk,
          lineHeight = 24.sp
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
          text = Localization.tr(
            "Create your unique shop profile and connect directly with local customers. A simple process to list your products and take orders.",
            lang
          ),
          fontSize = 13.sp,
          color = NearKartInk.copy(alpha = 0.85f),
          lineHeight = 18.sp
        )
        Spacer(modifier = Modifier.height(14.dp))
        Button(
          onClick = onCreateShopClick,
          colors = ButtonDefaults.buttonColors(containerColor = Color.White),
          shape = RoundedCornerShape(14.dp),
          modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .testTag("create_shop_profile_button")
        ) {
          Text(
            text = "${Localization.tr("Create a Shop Profile", lang)} 🏡✏️",
            color = NearKartBlue,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp
          )
        }
      }
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QuantityBottomSheet(
  product: Product,
  initialQty: Double = 1.0,
  lang: String,
  onDismiss: () -> Unit,
  onAddToCart: (Double) -> Unit
) {
  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  val isMeasure = product.unit == "kg" || product.unit == "litre"
  val chips = if (isMeasure) listOf(0.25, 0.5, 1.0, 2.0) else listOf(1.0, 2.0, 3.0, 5.0)

  var selectedQty by remember { mutableDoubleStateOf(initialQty) }
  var customText by remember { mutableStateOf("") }
  var subUnit by remember { mutableStateOf(if (product.unit == "litre") "ml" else "g") }

  val maxStock = product.onlineQty
  val isValid = selectedQty > 0 && selectedQty <= maxStock

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = sheetState,
    containerColor = Color.White
  ) {
    Column(modifier = Modifier.padding(18.dp)) {
      Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
        modifier = Modifier.fillMaxWidth()
      ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
          PhotoAvatar(
            imageUrl = product.imageUrl,
            fallbackName = product.name,
            size = 52.dp
          )
          Spacer(modifier = Modifier.width(12.dp))
          Column {
            Text(
              text = product.name,
              fontWeight = FontWeight.Bold,
              fontSize = 16.sp,
              color = NearKartInk
            )
            Text(
              text = "${Localization.formatMoney(product.price)}/${product.unit} • ${Localization.tr("In stock", lang)}: ${Localization.formatQty(maxStock, product.unit)}",
              fontSize = 12.sp,
              color = NearKartMute
            )
          }
        }
        IconButton(onClick = onDismiss) {
          Icon(imageVector = Icons.Default.Close, contentDescription = "Close", tint = NearKartMute)
        }
      }

      Spacer(modifier = Modifier.height(14.dp))
      Text(
        text = Localization.tr("How much do you need?", lang),
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        color = NearKartInk
      )
      Spacer(modifier = Modifier.height(8.dp))

      Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        chips.forEach { chipQty ->
          val isSelected = customText.isEmpty() && Math.abs(selectedQty - chipQty) < 0.001
          OutlinedButton(
            onClick = {
              selectedQty = chipQty
              customText = ""
            },
            colors = ButtonDefaults.outlinedButtonColors(
              containerColor = if (isSelected) NearKartBlue else Color.White
            ),
            border = androidx.compose.foundation.BorderStroke(
              1.dp,
              if (isSelected) NearKartBlue else NearKartLine
            ),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.weight(1f)
          ) {
            Text(
              text = Localization.formatQty(chipQty, product.unit),
              color = if (isSelected) Color.White else NearKartInk,
              fontWeight = FontWeight.Bold,
              fontSize = 12.sp
            )
          }
        }
      }

      Spacer(modifier = Modifier.height(12.dp))
      Text(
        text = Localization.tr("Or type your own amount", lang) + if (isMeasure) " (e.g. 750 g)" else "",
        fontSize = 12.sp,
        color = NearKartMute
      )
      Spacer(modifier = Modifier.height(6.dp))

      Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
          value = customText,
          onValueChange = { input ->
            customText = input
            val parsed = input.toDoubleOrNull()
            if (parsed != null && parsed > 0) {
              selectedQty = if (isMeasure && (subUnit == "g" || subUnit == "ml")) parsed / 1000.0 else parsed
            } else {
              selectedQty = 0.0
            }
          },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
          placeholder = { Text(if (isMeasure) "750" else "1") },
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          shape = RoundedCornerShape(12.dp),
          modifier = Modifier.weight(1f)
        )

        if (isMeasure) {
          Spacer(modifier = Modifier.width(8.dp))
          Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            val smallUnit = if (product.unit == "litre") "ml" else "g"
            val bigUnit = if (product.unit == "litre") "L" else "kg"

            Button(
              onClick = {
                subUnit = smallUnit
                val parsed = customText.toDoubleOrNull() ?: 0.0
                if (parsed > 0) selectedQty = parsed / 1000.0
              },
              colors = ButtonDefaults.buttonColors(
                containerColor = if (subUnit == smallUnit) NearKartBlue else NearKartBg
              ),
              shape = RoundedCornerShape(12.dp)
            ) {
              Text(
                smallUnit,
                color = if (subUnit == smallUnit) Color.White else NearKartInk,
                fontWeight = FontWeight.Bold
              )
            }

            Button(
              onClick = {
                subUnit = bigUnit
                val parsed = customText.toDoubleOrNull() ?: 0.0
                if (parsed > 0) selectedQty = parsed
              },
              colors = ButtonDefaults.buttonColors(
                containerColor = if (subUnit == bigUnit) NearKartBlue else NearKartBg
              ),
              shape = RoundedCornerShape(12.dp)
            ) {
              Text(
                bigUnit,
                color = if (subUnit == bigUnit) Color.White else NearKartInk,
                fontWeight = FontWeight.Bold
              )
            }
          }
        }
      }

      Spacer(modifier = Modifier.height(14.dp))
      Card(
        colors = CardDefaults.cardColors(containerColor = NearKartBg),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth()
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.SpaceBetween,
          modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp)
        ) {
          Column {
            Text(
              text = "${Localization.formatQty(selectedQty, product.unit)} × ${Localization.formatMoney(product.price)}/${product.unit}",
              fontSize = 12.sp,
              color = NearKartMute
            )
            Text(
              text = Localization.formatMoney(product.price * selectedQty),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 20.sp,
              color = NearKartInk
            )
          }

          NearKartTag(
            text = if (selectedQty > maxStock) Localization.tr("Not enough stock", lang) else Localization.tr("In stock", lang),
            type = if (selectedQty > maxStock) "red" else "green"
          )
        }
      }

      Spacer(modifier = Modifier.height(14.dp))
      Button(
        onClick = { onAddToCart(selectedQty) },
        enabled = isValid,
        colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
          .fillMaxWidth()
          .height(52.dp)
          .testTag("add_to_cart_sheet_button")
      ) {
        Text(
          text = if (isValid) "${Localization.tr("Add to cart", lang)} • ${Localization.formatMoney(product.price * selectedQty)}" else Localization.tr("Enter a valid amount", lang),
          fontWeight = FontWeight.Bold,
          fontSize = 16.sp
        )
      }
      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanguageSelectorBottomSheet(
  currentLang: String,
  onDismiss: () -> Unit,
  onSelectLanguage: (String) -> Unit
) {
  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = sheetState,
    containerColor = NearKartDarkBlue
  ) {
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      modifier = Modifier
        .fillMaxWidth()
        .padding(24.dp)
    ) {
      NearKartLogo(fontSize = 28)
      Spacer(modifier = Modifier.height(16.dp))
      Text(
        text = "Choose your language\nअपनी भाषा चुनें\nଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ",
        color = Color(0xFFCFDCF7),
        textAlign = TextAlign.Center,
        fontSize = 15.sp,
        lineHeight = 22.sp
      )
      Spacer(modifier = Modifier.height(20.dp))

      Localization.SUPPORTED_LANGUAGES.forEach { (code, label) ->
        val isSelected = currentLang == code
        Button(
          onClick = { onSelectLanguage(code) },
          colors = ButtonDefaults.buttonColors(
            containerColor = if (isSelected) NearKartLime else Color.White
          ),
          shape = RoundedCornerShape(16.dp),
          modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .padding(vertical = 4.dp)
            .testTag("lang_option_$code")
        ) {
          Text(
            text = label,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = NearKartInk
          )
        }
      }
      Spacer(modifier = Modifier.height(16.dp))
    }
  }
}
