package com.example.ui.screens

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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.data.model.UserLocation
import com.example.data.model.UserProfile
import com.example.data.model.UserSession
import com.example.ui.components.LocalBusinessGradientCard
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLime
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import com.example.ui.theme.NearKartRed

@Composable
fun BuyerProfileScreen(
  session: UserSession?,
  profile: UserProfile,
  location: UserLocation,
  lang: String,
  onNeedLogin: () -> Unit,
  onPartnerOnboarding: () -> Unit,
  onOpenOrders: () -> Unit,
  onOpenLanguage: () -> Unit,
  onOpenLocation: () -> Unit,
  onSaveProfile: (UserProfile) -> Unit,
  onLogout: () -> Unit,
  modifier: Modifier = Modifier
) {
  val isGuest = session == null
  val displayName = profile.name.ifBlank { session?.email ?: Localization.tr("Guest", lang) }
  val currentLangLabel = Localization.SUPPORTED_LANGUAGES.find { it.first == lang }?.second ?: "English"

  var isEditingAddress by remember { mutableStateOf(false) }
  var editName by remember { mutableStateOf(profile.name) }
  var editPhone by remember { mutableStateOf(profile.phone) }
  var editAddress by remember { mutableStateOf(profile.address) }

  Box(modifier = modifier.fillMaxSize().background(NearKartBg)) {
    LazyColumn(modifier = Modifier.fillMaxSize()) {
      // Top Hero
      item {
        Box(
          contentAlignment = Alignment.Center,
          modifier = Modifier
            .fillMaxWidth()
            .background(NearKartBlue)
            .statusBarsPadding()
            .padding(top = 16.dp, bottom = 48.dp)
        ) {
          Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
              contentAlignment = Alignment.Center,
              modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.2f))
                .border(3.dp, NearKartLime, CircleShape)
            ) {
              Text(
                text = if (isGuest) "👤" else displayName.firstOrNull()?.uppercase() ?: "U",
                fontSize = if (isGuest) 36.sp else 34.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
              )
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(
              text = displayName,
              fontSize = 22.sp,
              fontWeight = FontWeight.ExtraBold,
              color = Color.White
            )
            Text(
              text = if (isGuest) Localization.tr("Login or sign up to continue", lang) else (session?.email ?: ""),
              color = Color(0xFFCFDCF7),
              fontSize = 13.sp,
              modifier = Modifier.padding(top = 2.dp)
            )
          }
        }
      }

      // Overlapping Card: Login (Guest) or Summary (Buyer)
      item {
        Card(
          colors = CardDefaults.cardColors(containerColor = Color.White),
          shape = RoundedCornerShape(18.dp),
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
          modifier = Modifier
            .fillMaxWidth()
            .offset(y = (-24).dp)
            .padding(horizontal = 14.dp)
        ) {
          Column(modifier = Modifier.padding(16.dp)) {
            Text(
              text = Localization.tr("Welcome to NearKart", lang),
              fontWeight = FontWeight.ExtraBold,
              fontSize = 16.sp,
              color = NearKartInk
            )
            if (isGuest) {
              Text(
                text = Localization.tr("Your neighbourhood, your marketplace.", lang),
                fontSize = 12.sp,
                color = NearKartMute,
                modifier = Modifier.padding(vertical = 4.dp)
              )
              Spacer(modifier = Modifier.height(8.dp))
              Button(
                onClick = onNeedLogin,
                colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                  .fillMaxWidth()
                  .height(48.dp)
                  .testTag("profile_login_button")
              ) {
                Text(Localization.tr("Login", lang), fontWeight = FontWeight.Bold, fontSize = 15.sp)
              }
            } else {
              Spacer(modifier = Modifier.height(6.dp))
              Text(
                text = "📞 +91 ${profile.phone.ifBlank { "—" }}",
                fontSize = 13.sp,
                color = NearKartInk
              )
              Text(
                text = "📍 ${location.area}",
                fontSize = 13.sp,
                color = NearKartInk,
                modifier = Modifier.padding(top = 4.dp)
              )
              if (profile.address.isNotBlank()) {
                Text(
                  text = "🏠 ${profile.address}",
                  fontSize = 12.sp,
                  color = NearKartMute,
                  modifier = Modifier.padding(top = 4.dp)
                )
              }
            }
          }
        }
      }

      // Quick Action 2-column grid tiles
      item {
        Column(
          modifier = Modifier
            .offset(y = (-14).dp)
            .padding(horizontal = 14.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            ProfileTile(
              icon = "📍",
              title = Localization.tr("Delivery Location", lang),
              subtitle = location.area,
              onClick = onOpenLocation,
              modifier = Modifier.weight(1f)
            )
            ProfileTile(
              icon = "🌐",
              title = Localization.tr("Language", lang),
              subtitle = currentLangLabel,
              onClick = onOpenLanguage,
              modifier = Modifier.weight(1f)
            )
          }

          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            ProfileTile(
              icon = "📦",
              title = Localization.tr("My Orders", lang),
              subtitle = Localization.tr("Track live orders and view past purchases", lang),
              onClick = { if (isGuest) onNeedLogin() else onOpenOrders() },
              modifier = Modifier.weight(1f)
            )
            ProfileTile(
              icon = "🎧",
              title = Localization.tr("Customer Support", lang),
              subtitle = "Chat & queries",
              onClick = {},
              modifier = Modifier.weight(1f)
            )
          }

          if (!isGuest) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
              ProfileTile(
                icon = "🏠",
                title = Localization.tr("Saved Addresses", lang),
                subtitle = profile.address.ifBlank { "Full address" },
                onClick = { isEditingAddress = !isEditingAddress },
                modifier = Modifier.weight(1f)
              )
              ProfileTile(
                icon = "↪",
                title = Localization.tr("Log Out", lang),
                subtitle = "End session",
                isDanger = true,
                onClick = onLogout,
                modifier = Modifier.weight(1f)
              )
            }
          }
        }
      }

      // Saved address editor if toggled
      if (!isGuest && isEditingAddress) {
        item {
          Card(
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
            modifier = Modifier
              .fillMaxWidth()
              .padding(horizontal = 14.dp, vertical = 6.dp)
          ) {
            Column(modifier = Modifier.padding(14.dp)) {
              Text(
                text = Localization.tr("Saved Addresses", lang),
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = NearKartInk
              )
              Spacer(modifier = Modifier.height(10.dp))

              OutlinedTextField(
                value = editName,
                onValueChange = { editName = it },
                label = { Text(Localization.tr("Your name", lang)) },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = NearKartBlue,
                  unfocusedBorderColor = NearKartLine
                ),
                modifier = Modifier.fillMaxWidth()
              )
              Spacer(modifier = Modifier.height(8.dp))
              OutlinedTextField(
                value = editPhone,
                onValueChange = { editPhone = it.filter { c -> c.isDigit() }.take(10) },
                label = { Text(Localization.tr("Phone (10 digits)", lang)) },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = NearKartBlue,
                  unfocusedBorderColor = NearKartLine
                ),
                modifier = Modifier.fillMaxWidth()
              )
              Spacer(modifier = Modifier.height(8.dp))
              OutlinedTextField(
                value = editAddress,
                onValueChange = { editAddress = it },
                label = { Text(Localization.tr("Full address", lang)) },
                shape = RoundedCornerShape(12.dp),
                minLines = 2,
                colors = OutlinedTextFieldDefaults.colors(
                  focusedBorderColor = NearKartBlue,
                  unfocusedBorderColor = NearKartLine
                ),
                modifier = Modifier.fillMaxWidth()
              )
              Spacer(modifier = Modifier.height(12.dp))
              Button(
                onClick = {
                  onSaveProfile(profile.copy(name = editName, phone = editPhone, address = editAddress))
                  isEditingAddress = false
                },
                colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(Localization.tr("Save", lang), fontWeight = FontWeight.Bold)
              }
            }
          }
        }
      }

      // Local Business Presence Gradient Card (shown only for Guests!)
      if (isGuest) {
        item {
          LocalBusinessGradientCard(
            lang = lang,
            onCreateShopClick = onPartnerOnboarding,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp)
          )
        }
      }

      item {
        Spacer(modifier = Modifier.height(80.dp))
      }
    }
  }
}

@Composable
private fun ProfileTile(
  icon: String,
  title: String,
  subtitle: String,
  isDanger: Boolean = false,
  onClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  Card(
    colors = CardDefaults.cardColors(containerColor = Color.White),
    shape = RoundedCornerShape(18.dp),
    border = androidx.compose.foundation.BorderStroke(
      1.dp,
      if (isDanger) Color(0xFFF6C4D0) else NearKartLine
    ),
    modifier = modifier
      .clickable { onClick() }
      .testTag("profile_tile_${title.lowercase().replace(" ", "_")}")
  ) {
    Column(modifier = Modifier.padding(14.dp)) {
      Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
          .size(44.dp)
          .clip(RoundedCornerShape(12.dp))
          .background(if (isDanger) Color(0xFFFDECEF) else NearKartBg)
      ) {
        Text(text = icon, fontSize = 22.sp)
      }
      Spacer(modifier = Modifier.height(10.dp))
      Text(
        text = title,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        color = if (isDanger) NearKartRed else NearKartInk,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
      Text(
        text = subtitle,
        fontSize = 11.sp,
        color = NearKartMute,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
  }
}
