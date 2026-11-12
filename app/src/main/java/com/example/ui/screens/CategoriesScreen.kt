package com.example.ui.screens

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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.data.model.Shop
import com.example.ui.components.ShopMiniCard
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute

@Composable
fun CategoriesScreen(
  shops: List<Shop>,
  initialCategory: String? = null,
  lang: String,
  onOpenShop: (Shop) -> Unit,
  onBack: () -> Unit,
  modifier: Modifier = Modifier
) {
  var selectedCategory by remember { mutableStateOf(if (initialCategory == "All") null else initialCategory) }

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
          Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
              onClick = {
                if (selectedCategory != null) selectedCategory = null else onBack()
              }
            ) {
              Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Spacer(modifier = Modifier.width(6.dp))
            Column {
              Text(
                text = if (selectedCategory != null) Localization.tr(selectedCategory!!, lang) else Localization.tr("All Categories", lang),
                fontWeight = FontWeight.ExtraBold,
                fontSize = 22.sp,
                color = Color.White
              )
              if (selectedCategory != null) {
                val count = shops.count { it.category == selectedCategory }
                Text(
                  text = "$count ${Localization.tr("Shops Near You", lang)}",
                  color = Color(0xFFCFDCF7),
                  fontSize = 12.sp
                )
              }
            }
          }
        }
      }

      if (selectedCategory != null) {
        val categoryShops = shops.filter { it.category == selectedCategory }
        if (categoryShops.isEmpty()) {
          item {
            Text(
              text = Localization.tr("No shops have joined yet.", lang),
              color = NearKartMute,
              textAlign = TextAlign.Center,
              modifier = Modifier
                .fillMaxWidth()
                .padding(40.dp)
            )
          }
        } else {
          items(categoryShops) { shop ->
            ShopMiniCard(
              shop = shop,
              lang = lang,
              onClick = { onOpenShop(shop) },
              modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
            )
          }
        }
      } else {
        items(Localization.CATEGORIES) { cat ->
          val shopCount = shops.count { it.category == cat.key }
          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 6.dp)
              .clickable { selectedCategory = cat.key }
              .testTag("category_list_item_${cat.key}")
          ) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier.padding(14.dp)
            ) {
              Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                  .size(54.dp)
                  .clip(RoundedCornerShape(16.dp))
                  .background(Color(android.graphics.Color.parseColor(cat.bgHex)))
              ) {
                Text(text = cat.icon, fontSize = 26.sp)
              }

              Spacer(modifier = Modifier.width(14.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = Localization.tr(cat.key, lang),
                  fontWeight = FontWeight.Bold,
                  fontSize = 15.sp,
                  color = NearKartInk
                )
                Text(
                  text = "$shopCount shops",
                  fontSize = 12.sp,
                  color = NearKartMute
                )
              }

              Icon(
                imageVector = Icons.Default.ArrowForward,
                contentDescription = "View",
                tint = NearKartMute,
                modifier = Modifier.size(18.dp)
              )
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
