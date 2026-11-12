package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.data.model.Cart
import com.example.data.model.CategoryMeta
import com.example.data.model.Product
import com.example.data.model.Shop
import com.example.data.model.UserLocation
import com.example.ui.components.NearKartLogo
import com.example.ui.components.ProductGridTile
import com.example.ui.components.QuantityBottomSheet
import com.example.ui.components.ShopMiniCard
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartGreen
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLime
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BuyerHomeScreen(
  shops: List<Shop>,
  products: List<Product>,
  cart: Cart?,
  location: UserLocation,
  lang: String,
  onOpenShop: (Shop) -> Unit,
  onOpenCategory: (String) -> Unit,
  onOpenCart: () -> Unit,
  onOpenProfile: () -> Unit,
  onOpenMenu: () -> Unit,
  onAddToCart: (Shop, Product, Double) -> Unit,
  onUpdateLocation: (UserLocation) -> Unit,
  modifier: Modifier = Modifier
) {
  var searchQuery by remember { mutableStateOf("") }
  var isFilterExpanded by remember { mutableStateOf(false) }
  var onlyOpenFilter by remember { mutableStateOf(false) }
  var selectedCategoryFilter by remember { mutableStateOf<String?>(null) }
  var selectedProductForQty by remember { mutableStateOf<Product?>(null) }
  var showLocationSheet by remember { mutableStateOf(false) }

  // Banner carousel state
  val offers = shops.filter { !it.offer.isNullOrBlank() }
  val banners = remember(offers) {
    listOf(
      "Great deals" to "near you" to "Discover offers from local shops"
    ) + offers.map { (it.name to (it.offer ?: "")) to it.area }
  }
  var bannerIndex by remember { mutableIntStateOf(0) }
  LaunchedEffect(banners.size) {
    while (true) {
      delay(4000L)
      if (banners.isNotEmpty()) {
        bannerIndex = (bannerIndex + 1) % banners.size
      }
    }
  }

  // Filtered shops & products
  val filteredShops = shops.filter { shop ->
    val matchesSearch = searchQuery.isBlank() ||
      Localization.matchText("${shop.name} ${shop.category} ${shop.area}", searchQuery)
    val matchesOpen = !onlyOpenFilter || shop.isOpen
    val matchesCat = selectedCategoryFilter == null || shop.category == selectedCategoryFilter
    matchesSearch && matchesOpen && matchesCat
  }

  val filteredProducts = products.filter { prod ->
    val matchesSearch = searchQuery.isBlank() ||
      Localization.matchText("${prod.name} ${prod.category} ${prod.shopName ?: ""}", searchQuery)
    val matchesCat = selectedCategoryFilter == null || prod.category == selectedCategoryFilter
    matchesSearch && matchesCat
  }

  // Alternatives if searched items are all out of stock
  val alternativeProducts = remember(filteredProducts, searchQuery) {
    if (searchQuery.isNotBlank() && filteredProducts.isNotEmpty() && filteredProducts.all { it.onlineQty <= 0 }) {
      val cats = filteredProducts.map { it.category }.toSet()
      products.filter { it.onlineQty > 0 && cats.contains(it.category) && !filteredProducts.any { m -> m.id == it.id } }.take(6)
    } else emptyList()
  }

  Box(modifier = modifier.fillMaxSize().background(NearKartBg)) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
      // Top Blue Hero Header
      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .background(NearKartBlue)
            .statusBarsPadding()
            .padding(16.dp)
        ) {
          Column {
            // Header Action Row
            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.SpaceBetween,
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onOpenMenu, modifier = Modifier.testTag("menu_button")) {
                  Icon(
                    imageVector = Icons.Default.Menu,
                    contentDescription = "Menu",
                    tint = Color.White
                  )
                }
                NearKartLogo(fontSize = 24)
              }

              Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = {}, modifier = Modifier.testTag("notification_bell")) {
                  Icon(
                    imageVector = Icons.Default.Notifications,
                    contentDescription = "Notifications",
                    tint = Color.White
                  )
                }
                Box(
                  contentAlignment = Alignment.Center,
                  modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.2f))
                    .clickable { onOpenProfile() }
                    .testTag("profile_avatar_button")
                ) {
                  Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "Profile",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                  )
                }
              }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
              Text(
                text = "${Localization.tr("Hello,", lang)} ",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
              )
              Text(
                text = Localization.tr("Shopper!", lang),
                fontSize = 22.sp,
                fontWeight = FontWeight.ExtraBold,
                color = NearKartLime
              )
              Text(text = " 👋", fontSize = 20.sp)
            }

            // Location Bar
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier
                .padding(top = 6.dp)
                .clickable { showLocationSheet = true }
                .testTag("location_picker_bar")
            ) {
              Icon(
                imageVector = Icons.Default.LocationOn,
                contentDescription = "Location",
                tint = NearKartLime,
                modifier = Modifier.size(16.dp)
              )
              Spacer(modifier = Modifier.width(4.dp))
              Text(
                text = "${Localization.tr("Delivering to", lang)} • ",
                color = Color(0xFFCFDCF7),
                fontSize = 13.sp
              )
              Text(
                text = "${location.area} ⌄",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp
              )
            }

            Spacer(modifier = Modifier.height(14.dp))
            // Search Input Row
            Card(
              colors = CardDefaults.cardColors(containerColor = Color.White),
              shape = RoundedCornerShape(14.dp),
              modifier = Modifier.fillMaxWidth()
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp)
              ) {
                Icon(
                  imageVector = Icons.Default.Search,
                  contentDescription = "Search",
                  tint = NearKartMute
                )
                OutlinedTextField(
                  value = searchQuery,
                  onValueChange = { searchQuery = it },
                  placeholder = {
                    Text(
                      text = Localization.tr("Search products, shops, and categories", lang),
                      fontSize = 13.sp,
                      color = NearKartMute
                    )
                  },
                  colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent
                  ),
                  modifier = Modifier
                    .weight(1f)
                    .testTag("search_input")
                )
                Box(
                  modifier = Modifier
                    .width(1.dp)
                    .height(20.dp)
                    .background(NearKartLine)
                )
                IconButton(onClick = { isFilterExpanded = !isFilterExpanded }) {
                  Icon(
                    imageVector = Icons.Default.FilterList,
                    contentDescription = "Filters",
                    tint = if (isFilterExpanded || onlyOpenFilter || selectedCategoryFilter != null) NearKartBlue else NearKartMute
                  )
                }
              }
            }
          }
        }
      }

      // Filter Options Bar (collapsible)
      if (isFilterExpanded) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(14.dp),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 8.dp)
          ) {
            Column(modifier = Modifier.padding(12.dp)) {
              Text(
                text = "Filters",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = NearKartInk
              )
              Spacer(modifier = Modifier.height(8.dp))
              LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                  FilterChipItem(
                    label = Localization.tr("Open now", lang),
                    isSelected = onlyOpenFilter,
                    onClick = { onlyOpenFilter = !onlyOpenFilter }
                  )
                }
                item {
                  FilterChipItem(
                    label = Localization.tr("All", lang),
                    isSelected = selectedCategoryFilter == null,
                    onClick = { selectedCategoryFilter = null }
                  )
                }
                items(Localization.CATEGORIES) { cat ->
                  FilterChipItem(
                    label = Localization.tr(cat.key, lang),
                    isSelected = selectedCategoryFilter == cat.key,
                    onClick = {
                      selectedCategoryFilter = if (selectedCategoryFilter == cat.key) null else cat.key
                    }
                  )
                }
              }
            }
          }
        }
      }

      // Explore Categories Section (when not searching)
      if (searchQuery.isBlank()) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(18.dp),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 10.dp)
          ) {
            Column(modifier = Modifier.padding(14.dp)) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(
                  text = Localization.tr("Explore Categories", lang),
                  fontWeight = FontWeight.ExtraBold,
                  fontSize = 16.sp,
                  color = NearKartInk
                )
                Text(
                  text = Localization.tr("View All →", lang),
                  color = NearKartBlue,
                  fontWeight = FontWeight.Bold,
                  fontSize = 13.sp,
                  modifier = Modifier
                    .clickable { onOpenCategory("All") }
                    .testTag("view_all_categories_button")
                )
              }

              Spacer(modifier = Modifier.height(12.dp))
              // 4 columns of categories
              val displayCategories = Localization.CATEGORIES.take(7) + listOf(
                CategoryMeta("More", "•••", "#E8F0FF")
              )

              Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                displayCategories.chunked(4).forEach { rowList ->
                  Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                  ) {
                    rowList.forEach { cat ->
                      CategoryTile(
                        meta = cat,
                        lang = lang,
                        onClick = {
                          if (cat.key == "More") onOpenCategory("All") else onOpenCategory(cat.key)
                        },
                        modifier = Modifier.weight(1f)
                      )
                    }
                    if (rowList.size < 4) {
                      repeat(4 - rowList.size) {
                        Spacer(modifier = Modifier.weight(1f))
                      }
                    }
                  }
                }
              }
            }
          }
        }

        // Animated Rotating Deal Banner
        item {
          if (banners.isNotEmpty()) {
            val (mainTitles, subArea) = banners[bannerIndex % banners.size]
            val (t1, t2) = mainTitles
            Card(
              colors = CardDefaults.cardColors(containerColor = Color(0xFFE9F1FF)),
              shape = RoundedCornerShape(18.dp),
              modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 4.dp)
                .testTag("deals_banner")
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.padding(16.dp)
              ) {
                Column(modifier = Modifier.weight(1f)) {
                  Text(
                    text = Localization.tr(t1, lang),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 20.sp,
                    color = NearKartInk
                  )
                  Text(
                    text = Localization.tr(t2, lang),
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 20.sp,
                    color = NearKartGreen
                  )
                  Text(
                    text = Localization.tr(subArea, lang),
                    fontSize = 12.sp,
                    color = NearKartMute,
                    modifier = Modifier.padding(top = 4.dp)
                  )
                  Row(modifier = Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    banners.forEachIndexed { i, _ ->
                      Box(
                        modifier = Modifier
                          .height(5.dp)
                          .width(if (i == bannerIndex % banners.size) 22.dp else 5.dp)
                          .clip(CircleShape)
                          .background(if (i == bannerIndex % banners.size) NearKartBlue else Color(0xFFC3CDE2))
                      )
                    }
                  }
                }
                Text(text = "🛒", fontSize = 52.sp)
              }
            }
          }
        }
      }

      // Shops Near You Section
      item {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = "🏪 ${Localization.tr("Shops Near You", lang)}",
              fontWeight = FontWeight.ExtraBold,
              fontSize = 16.sp,
              color = NearKartInk
            )
            if (filteredShops.size > 4) {
              Text(
                text = Localization.tr("View All →", lang),
                color = NearKartBlue,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                modifier = Modifier.clickable { onOpenCategory("All") }
              )
            }
          }

          Spacer(modifier = Modifier.height(10.dp))
          if (filteredShops.isEmpty()) {
            Text(
              text = Localization.tr("No shops have joined yet.", lang),
              color = NearKartMute,
              textAlign = TextAlign.Center,
              modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
            )
          } else {
            // 2 column grid
            filteredShops.take(6).chunked(2).forEach { pair ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                pair.forEach { shop ->
                  Box(modifier = Modifier.weight(1f)) {
                    ShopMiniCard(
                      shop = shop,
                      lang = lang,
                      onClick = { onOpenShop(shop) }
                    )
                  }
                }
                if (pair.size == 1) {
                  Spacer(modifier = Modifier.weight(1f))
                }
              }
              Spacer(modifier = Modifier.height(10.dp))
            }
          }
        }
      }

      // Popular Products Section
      item {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) {
          Text(
            text = "🛍️ ${Localization.tr("Popular Products", lang)}",
            fontWeight = FontWeight.ExtraBold,
            fontSize = 16.sp,
            color = NearKartInk
          )
          Spacer(modifier = Modifier.height(10.dp))

          if (filteredProducts.isEmpty()) {
            Text(
              text = Localization.tr("No products found.", lang),
              color = NearKartMute,
              textAlign = TextAlign.Center,
              modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp)
            )
          } else {
            filteredProducts.take(12).chunked(2).forEach { pair ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                pair.forEach { product ->
                  Box(modifier = Modifier.weight(1f)) {
                    ProductGridTile(
                      product = product,
                      lang = lang,
                      onClick = { selectedProductForQty = product }
                    )
                  }
                }
                if (pair.size == 1) {
                  Spacer(modifier = Modifier.weight(1f))
                }
              }
              Spacer(modifier = Modifier.height(10.dp))
            }
          }

          // Alternative Recommendations
          if (alternativeProducts.isNotEmpty()) {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
              text = Localization.tr("Out of stock here. Available alternatives:", lang),
              color = NearKartMute,
              fontSize = 12.sp
            )
            Text(
              text = Localization.tr("You may also like", lang),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 15.sp,
              color = NearKartInk,
              modifier = Modifier.padding(vertical = 4.dp)
            )
            alternativeProducts.chunked(2).forEach { pair ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
              ) {
                pair.forEach { prod ->
                  Box(modifier = Modifier.weight(1f)) {
                    ProductGridTile(
                      product = prod,
                      lang = lang,
                      onClick = { selectedProductForQty = prod }
                    )
                  }
                }
                if (pair.size == 1) {
                  Spacer(modifier = Modifier.weight(1f))
                }
              }
              Spacer(modifier = Modifier.height(10.dp))
            }
          }
        }
      }

      // Bottom padding for navigation bar
      item {
        Spacer(modifier = Modifier.height(80.dp))
      }
    }

    // Sticky Bottom Cart Bar
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
            .testTag("floating_cart_bar")
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
    val currentQty = cart?.items?.get(prod.id)?.qty ?: 1.0
    val parentShop = shops.find { it.id == prod.shopId }
      ?: Shop(id = prod.shopId, name = prod.shopName ?: "Shop")

    QuantityBottomSheet(
      product = prod,
      initialQty = currentQty,
      lang = lang,
      onDismiss = { selectedProductForQty = null },
      onAddToCart = { qty ->
        onAddToCart(parentShop, prod, qty)
        selectedProductForQty = null
      }
    )
  }

  // Location Selector Bottom Sheet
  if (showLocationSheet) {
    LocationSelectorBottomSheet(
      currentLocation = location,
      lang = lang,
      onDismiss = { showLocationSheet = false },
      onSaveLocation = { newLoc ->
        onUpdateLocation(newLoc)
        showLocationSheet = false
      }
    )
  }
}

@Composable
private fun CategoryTile(
  meta: CategoryMeta,
  lang: String,
  onClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  Column(
    horizontalAlignment = Alignment.CenterHorizontally,
    modifier = modifier
      .clickable { onClick() }
      .padding(4.dp)
      .testTag("category_tile_${meta.key}")
  ) {
    Box(
      contentAlignment = Alignment.Center,
      modifier = Modifier
        .size(54.dp)
        .clip(RoundedCornerShape(16.dp))
        .background(Color(android.graphics.Color.parseColor(meta.bgHex)))
    ) {
      Text(
        text = meta.icon,
        fontSize = if (meta.key == "More") 20.sp else 26.sp
      )
    }
    Spacer(modifier = Modifier.height(4.dp))
    Text(
      text = Localization.tr(meta.key, lang),
      fontSize = 11.sp,
      fontWeight = FontWeight.Bold,
      color = NearKartInk,
      textAlign = TextAlign.Center,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )
  }
}

@Composable
private fun FilterChipItem(
  label: String,
  isSelected: Boolean,
  onClick: () -> Unit
) {
  Surface(
    color = if (isSelected) NearKartBlue else Color.White,
    shape = RoundedCornerShape(20.dp),
    border = androidx.compose.foundation.BorderStroke(1.dp, if (isSelected) NearKartBlue else NearKartLine),
    modifier = Modifier.clickable { onClick() }
  ) {
    Text(
      text = label,
      color = if (isSelected) Color.White else NearKartInk,
      fontWeight = FontWeight.Bold,
      fontSize = 12.sp,
      modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationSelectorBottomSheet(
  currentLocation: UserLocation,
  lang: String,
  onDismiss: () -> Unit,
  onSaveLocation: (UserLocation) -> Unit
) {
  val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
  var areaText by remember { mutableStateOf(currentLocation.area) }
  var isDetecting by remember { mutableStateOf(false) }

  ModalBottomSheet(
    onDismissRequest = onDismiss,
    sheetState = sheetState,
    containerColor = Color.White
  ) {
    Column(modifier = Modifier.padding(20.dp)) {
      Text(
        text = Localization.tr("Select your location", lang),
        fontWeight = FontWeight.Bold,
        fontSize = 17.sp,
        color = NearKartInk
      )
      Spacer(modifier = Modifier.height(14.dp))

      Button(
        onClick = {
          isDetecting = true
          // GPS detection simulation / geocoding
          areaText = "Main Market, Sector 4"
          isDetecting = false
          onSaveLocation(UserLocation(area = "Main Market, Sector 4", fullAddress = "Near Gandhi Square, Sector 4"))
        },
        colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
          .fillMaxWidth()
          .height(48.dp)
          .testTag("use_gps_location_button")
      ) {
        Text(
          text = if (isDetecting) Localization.tr("Please wait...", lang) else Localization.tr("Use my current location", lang),
          fontWeight = FontWeight.Bold,
          fontSize = 15.sp
        )
      }

      Spacer(modifier = Modifier.height(16.dp))
      OutlinedTextField(
        value = areaText,
        onValueChange = { areaText = it },
        label = { Text(Localization.tr("Village / Area", lang)) },
        colors = OutlinedTextFieldDefaults.colors(
          focusedBorderColor = NearKartBlue,
          unfocusedBorderColor = NearKartLine
        ),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
          .fillMaxWidth()
          .testTag("area_text_input")
      )

      Spacer(modifier = Modifier.height(14.dp))
      OutlinedButton(
        onClick = {
          if (areaText.isNotBlank()) {
            onSaveLocation(UserLocation(area = areaText.trim()))
          }
        },
        border = androidx.compose.foundation.BorderStroke(1.5.dp, NearKartBlue),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier
          .fillMaxWidth()
          .height(48.dp)
          .testTag("save_location_button")
      ) {
        Text(
          text = Localization.tr("Save", lang),
          color = NearKartBlue,
          fontWeight = FontWeight.Bold,
          fontSize = 15.sp
        )
      }
      Spacer(modifier = Modifier.height(20.dp))
    }
  }
}
