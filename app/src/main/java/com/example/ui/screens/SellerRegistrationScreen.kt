package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.ui.components.NearKartLogo
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartRed

@Composable
fun SellerRegistrationScreen(
  defaultArea: String,
  lang: String,
  isLoading: Boolean,
  onRegister: (name: String, owner: String, phone: String, area: String, category: String, photoUrl: String?) -> Unit,
  onLogout: () -> Unit,
  modifier: Modifier = Modifier
) {
  var name by remember { mutableStateOf("") }
  var owner by remember { mutableStateOf("") }
  var phone by remember { mutableStateOf("") }
  var area by remember { mutableStateOf(defaultArea) }
  var category by remember { mutableStateOf("Grocery") }
  var photoUrl by remember { mutableStateOf("") }
  var errorMsg by remember { mutableStateOf<String?>(null) }

  val scrollState = rememberScrollState()

  Column(
    modifier = modifier
      .fillMaxSize()
      .background(NearKartBg)
      .verticalScroll(scrollState)
      .testTag("seller_registration_screen")
  ) {
    // Header
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .background(NearKartBlue)
        .statusBarsPadding()
        .padding(20.dp)
    ) {
      Column {
        NearKartLogo(fontSize = 28)
        Spacer(modifier = Modifier.height(14.dp))
        Text(
          text = Localization.tr("Establish Your Local Business Presence", lang),
          fontSize = 22.sp,
          fontWeight = FontWeight.ExtraBold,
          color = Color.White
        )
        Text(
          text = Localization.tr("Sell your products online and reach shoppers near you", lang),
          color = Color(0xFFCFDCF7),
          fontSize = 13.sp,
          modifier = Modifier.padding(top = 4.dp)
        )
      }
    }

    Card(
      colors = CardDefaults.cardColors(containerColor = Color.White),
      shape = RoundedCornerShape(18.dp),
      border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
      modifier = Modifier
        .fillMaxWidth()
        .padding(14.dp)
    ) {
      Column(modifier = Modifier.padding(18.dp)) {
        Text(
          text = Localization.tr("Register your shop", lang),
          fontWeight = FontWeight.ExtraBold,
          fontSize = 18.sp,
          color = NearKartInk
        )
        Spacer(modifier = Modifier.height(14.dp))

        OutlinedTextField(
          value = name,
          onValueChange = { name = it },
          label = { Text(Localization.tr("Shop name", lang)) },
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("seller_shop_name_input")
        )

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
          value = owner,
          onValueChange = { owner = it },
          label = { Text(Localization.tr("Owner name", lang)) },
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("seller_owner_name_input")
        )

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
          value = phone,
          onValueChange = { phone = it.filter { c -> c.isDigit() }.take(10) },
          label = { Text(Localization.tr("Phone number", lang)) },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("seller_phone_input")
        )

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
          value = area,
          onValueChange = { area = it },
          label = { Text(Localization.tr("Village / Area", lang)) },
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("seller_area_input")
        )

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedTextField(
          value = photoUrl,
          onValueChange = { photoUrl = it },
          label = { Text("Shop photo link (optional)") },
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth()
        )

        Spacer(modifier = Modifier.height(12.dp))
        Text(
          text = Localization.tr("Category", lang),
          fontWeight = FontWeight.Bold,
          fontSize = 13.sp,
          color = NearKartInk
        )
        Spacer(modifier = Modifier.height(6.dp))
        LazyRow {
          items(Localization.CATEGORIES) { cat ->
            val isSelected = category == cat.key
            Surface(
              color = if (isSelected) NearKartBlue else NearKartBg,
              shape = RoundedCornerShape(18.dp),
              border = androidx.compose.foundation.BorderStroke(1.dp, if (isSelected) NearKartBlue else NearKartLine),
              modifier = Modifier
                .padding(end = 8.dp)
                .testTag("seller_cat_${cat.key}")
            ) {
              Text(
                text = "${cat.icon} ${Localization.tr(cat.key, lang)}",
                color = if (isSelected) Color.White else NearKartInk,
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
              )
            }
          }
        }

        errorMsg?.let { err ->
          Spacer(modifier = Modifier.height(10.dp))
          Text(text = err, color = NearKartRed, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }

        Spacer(modifier = Modifier.height(18.dp))
        Button(
          onClick = {
            if (name.isBlank() || owner.isBlank() || phone.length != 10 || area.isBlank()) {
              errorMsg = "Enter shop name, owner, 10-digit phone and area"
              return@Button
            }
            errorMsg = null
            onRegister(name.trim(), owner.trim(), phone.trim(), area.trim(), category, photoUrl.trim().ifBlank { null })
          },
          enabled = !isLoading,
          colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
          shape = RoundedCornerShape(14.dp),
          modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .testTag("submit_shop_registration_button")
        ) {
          if (isLoading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
          } else {
            Text(Localization.tr("Open my shop", lang), fontWeight = FontWeight.Bold, fontSize = 16.sp)
          }
        }

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedButton(
          onClick = onLogout,
          shape = RoundedCornerShape(14.dp),
          modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
          Text(Localization.tr("Log Out", lang), color = NearKartRed, fontWeight = FontWeight.Bold)
        }
      }
    }
  }
}
