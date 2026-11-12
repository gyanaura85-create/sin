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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.data.model.Cart
import com.example.data.model.Product
import com.example.data.model.Shop
import com.example.ui.components.NearKartTag
import com.example.ui.components.PhotoAvatar
import com.example.ui.components.QuantityBottomSheet
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartGreen
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import com.example.ui.theme.NearKartOrange
import com.example.ui.theme.NearKartRed

@Composable
fun ShopDetailScreen(
  shop: Shop,
  products: List<Product>,
  cart: Cart?,
  lang: String,
  onBack: () -> Unit,
  onAddToCart: (Shop, Product, Double) -> Unit,
  onOpenCart: () -> Unit,
  modifier: Modifier = Modifier
) {
  val context = LocalContext.current
  var searchQuery by remember { mutableStateOf("") }
  var selectedCategory by remember { mutableStateOf("All") }
  var minPriceText by remember { mutableStateOf("") }
  var maxPriceText by remember { mutableStateOf("") }
  var selectedProductForQty by remember { mutableStateOf<Product?>(null) }

  val shopProducts = remember(products, shop.id) {
    products.filter { it.shopId == shop.id }
  }

  val categories = remember(shopProducts) {
    listOf("All") + shopProducts.map { it.category }.distinct().filter { it.isNotBlank() }
  }

  val filteredProducts = shopProducts.filter { prod ->
    val matchesCat = selectedCategory == "All" || prod.category == selectedCategory
    val matchesSearch = searchQuery.isBlank() ||
      Localization.matchText("${prod.name} ${prod.category}", searchQuery)
    val minP = minPriceText.toDoubleOrNull() ?: 0.0
    val maxP = maxPriceText.toDoubleOrNull() ?: Double.MAX_VALUE
    val matchesPrice = prod.price in minP..maxP
    matchesCat && matchesSearch && matchesPrice
  }

  val mineCartItems = if (cart?.shop?.id == shop.id) cart.items else emptyMap()

  Box(modifier = modifier.fillMaxSize().background(NearKartBg)) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
      // Shop Header
      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(NearKartBlue)
            .statusBarsPadding()
            .padding(16.dp)
        ) {
          Column {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier.fillMaxWidth()
            ) {
              IconButton(onClick = onBack, modifier = Modifier.testTag("back_button")) {
                Icon(
                  imageVector = Icons.Default.ArrowBack,
                  contentDescription = "Back",
                  tint = Color.White
                )
              }
              Text(
                text = Localization.tr("Back", lang),
                color = Color(0xFFCFDCF7),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
              )
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
              PhotoAvatar(
                imageUrl = shop.photoUrl,
                fallbackName = shop.name,
                size = 72.dp,
                isRound = true
              )
              Spacer(modifier = Modifier.width(14.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = shop.name,
                  fontWeight = FontWeight.ExtraBold,
                  fontSize = 20.sp,
                  color = Color.White
                )
                if (shop.rating > 0) {
                  Text(
                    text = "★ ${shop.rating} (${shop.ratingCount})",
                    color = Color.White,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 2.dp)
                  )
                }
                Text(
                  text = "${Localization.tr(shop.category, lang)} • ${shop.area}",
                  color = Color(0xFFCFDCF7),
                  fontSize = 12.sp,
                  modifier = Modifier.padding(top = 2.dp)
                )

                Row(
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(8.dp),
                  modifier = Modifier.padding(top = 6.dp)
                ) {
                  NearKartTag(
                    text = if (shop.isOpen) Localization.tr("● Open", lang) else Localization.tr("● Closed", lang),
                    type = if (shop.isOpen) "green" else "red",
                    isSmall = true
                  )

                  if (shop.phone.isNotBlank()) {
                    Row(
                      verticalAlignment = Alignment.CenterVertically,
                      modifier = Modifier
                        .clickable {
                          val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${shop.phone}"))
                          context.startActivity(intent)
                        }
                    ) {
                      Icon(
                        imageVector = Icons.Default.Call,
                        contentDescription = "Call",
                        tint = Color(0xFFCFDCF7),
                        modifier = Modifier.size(14.dp)
                      )
                      Spacer(modifier = Modifier.width(4.dp))
                      Text(
                        text = shop.phone,
                        color = Color(0xFFCFDCF7),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                      )
                    }
                  }
                }
              }
            }

            if (!shop.offer.isNullOrBlank()) {
              Spacer(modifier = Modifier.height(10.dp))
              Text(
                text = "🎁 ${shop.offer}",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold
              )
            }
          }
        }
      }

      // If closed warning
      if (!shop.isOpen) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color(0xFFFBE0DB)),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 8.dp)
          ) {
            Text(
              text = Localization.tr("The shop is closed right now.", lang),
              color = NearKartRed,
              fontWeight = FontWeight.Bold,
              fontSize = 13.sp,
              modifier = Modifier.padding(12.dp)
            )
          }
        }
      }

      // Filter & Search Box
      item {
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(16.dp),
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
          Column(modifier = Modifier.padding(14.dp)) {
            OutlinedTextField(
              value = searchQuery,
              onValueChange = { searchQuery = it },
              placeholder = { Text(Localization.tr("Search in this shop", lang)) },
              leadingIcon = {
                Icon(Icons.Default.Search, contentDescription = "Search", tint = NearKartMute)
              },
              colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = NearKartBlue,
                unfocusedBorderColor = NearKartLine
              ),
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth().testTag("shop_search_input")
            )

            Spacer(modifier = Modifier.height(10.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              items(categories) { cat ->
                val isSelected = selectedCategory == cat
                Surface(
                  color = if (isSelected) NearKartBlue else NearKartBg,
                  shape = RoundedCornerShape(18.dp),
                  border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (isSelected) NearKartBlue else NearKartLine
                  ),
                  modifier = Modifier.clickable { selectedCategory = cat }
                ) {
                  Text(
                    text = Localization.tr(cat, lang),
                    color = if (isSelected) Color.White else NearKartInk,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                  )
                }
              }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
              text = Localization.tr("Price range (₹)", lang),
              fontSize = 12.sp,
              fontWeight = FontWeight.Bold,
              color = NearKartMute
            )
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
              OutlinedTextField(
                value = minPriceText,
                onValueChange = { minPriceText = it },
                placeholder = { Text(Localization.tr("Min", lang)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = NearKartBlue,
                  unfocusedBorderColor = NearKartLine
                ),
                modifier = Modifier.weight(1f)
              )
              Spacer(modifier = Modifier.width(8.dp))
              Text(text = "–", color = NearKartMute, fontWeight = FontWeight.Bold)
              Spacer(modifier = Modifier.width(8.dp))
              OutlinedTextField(
                value = maxPriceText,
                onValueChange = { maxPriceText = it },
                placeholder = { Text(Localization.tr("Max", lang)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = NearKartBlue,
                  unfocusedBorderColor = NearKartLine
                ),
                modifier = Modifier.weight(1f)
              )
            }
          }
        }
      }

      // Products List
      item {
        Text(
          text = "${Localization.tr("Products", lang)} (${filteredProducts.size})",
          fontWeight = FontWeight.ExtraBold,
          fontSize = 16.sp,
          color = NearKartInk,
          modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)
        )
      }

      if (filteredProducts.isEmpty()) {
        item {
          Text(
            text = Localization.tr("No products found.", lang),
            color = NearKartMute,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(30.dp)
          )
        }
      } else {
        items(filteredProducts) { product ->
          val isOutOfStock = product.onlineQty <= 0.0
          val inCart = mineCartItems[product.id]

          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 5.dp)
              .testTag("shop_product_item_${product.id}")
          ) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier.padding(12.dp)
            ) {
              PhotoAvatar(
                imageUrl = product.imageUrl,
                fallbackName = product.name,
                size = 56.dp
              )
              Spacer(modifier = Modifier.width(12.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = product.name,
                  fontWeight = FontWeight.Bold,
                  fontSize = 14.sp,
                  color = NearKartInk,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.Bottom) {
                  Text(
                    text = Localization.formatMoney(product.price),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 14.sp,
                    color = NearKartGreen
                  )
                  Text(
                    text = " / ${product.unit}",
                    fontSize = 11.sp,
                    color = NearKartMute
                  )
                  if (product.originalPrice != null && product.originalPrice > product.price) {
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                      text = Localization.formatMoney(product.originalPrice),
                      fontSize = 11.sp,
                      color = NearKartMute,
                      textDecoration = TextDecoration.LineThrough
                    )
                  }
                }
                if (isOutOfStock) {
                  NearKartTag(
                    text = Localization.tr("Out of stock", lang),
                    type = "red",
                    isSmall = true,
                    modifier = Modifier.padding(top = 4.dp)
                  )
                } else if (product.onlineQty <= product.lowAlert) {
                  NearKartTag(
                    text = "${Localization.tr("In stock", lang)}: ${Localization.formatQty(product.onlineQty, product.unit)}",
                    type = "yellow",
                    isSmall = true,
                    modifier = Modifier.padding(top = 4.dp)
                  )
                }
              }

              if (isOutOfStock) {
                OutlinedButton(
                  onClick = {},
                  enabled = false,
                  shape = RoundedCornerShape(10.dp)
                ) {
                  Text(
                    text = Localization.tr("Out of stock", lang),
                    fontSize = 11.sp
                  )
                }
              } else if (inCart != null) {
                Button(
                  onClick = { selectedProductForQty = product },
                  colors = ButtonDefaults.buttonColors(containerColor = NearKartGreen),
                  shape = RoundedCornerShape(10.dp)
                ) {
                  Text(
                    text = "${Localization.formatQty(inCart.qty, product.unit)} ✎",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                  )
                }
              } else {
                Button(
                  onClick = { selectedProductForQty = product },
                  enabled = shop.isOpen,
                  colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
                  shape = RoundedCornerShape(10.dp),
                  modifier = Modifier.testTag("add_product_${product.id}")
                ) {
                  Text(
                    text = Localization.tr("Add", lang),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                  )
                }
              }
            }
          }
        }
      }

      item {
        Spacer(modifier = Modifier.height(90.dp))
      }
    }

    // Floating Cart Bar
    if (cart != null && cart.itemCount > 0) {
      Box(
        modifier = Modifier
          .align(Alignment.BottomCenter)
          .padding(14.dp)
          .fillMaxWidth()
      ) {
        Surface(
          color = NearKartGreen,
          shape = RoundedCornerShape(16.dp),
          shadowElevation = 6.dp,
          modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpenCart() }
            .testTag("shop_floating_cart_bar")
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)
          ) {
            Text(
              text = "${cart.itemCount} ${Localization.tr("items •", lang)} ${Localization.formatMoney(cart.totalAmount)}",
              color = Color.White,
              fontWeight = FontWeight.Bold,
              fontSize = 15.sp
            )
            Text(
              text = Localization.tr("View Cart →", lang),
              color = Color.White,
              fontWeight = FontWeight.ExtraBold,
              fontSize = 15.sp
            )
          }
        }
      }
    }
  }

  // Quantity Selection Bottom Sheet
  selectedProductForQty?.let { prod ->
    val currentQty = mineCartItems[prod.id]?.qty ?: 1.0
    QuantityBottomSheet(
      product = prod,
      initialQty = currentQty,
      lang = lang,
      onDismiss = { selectedProductForQty = null },
      onAddToCart = { qty ->
        onAddToCart(shop, prod, qty)
        selectedProductForQty = null
      }
    )
  }
}
