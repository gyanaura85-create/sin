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
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.localization.Localization
import com.example.ui.components.NearKartLogo
import com.example.ui.theme.NearKartBg
import com.example.ui.theme.NearKartBlue
import com.example.ui.theme.NearKartInk
import com.example.ui.theme.NearKartLine
import com.example.ui.theme.NearKartMute
import com.example.ui.theme.NearKartRed

@Composable
fun AuthScreen(
  role: String, // "buyer" | "seller"
  lang: String,
  isLoading: Boolean,
  onLogin: (email: String, pass: String, onResult: (Boolean, String?) -> Unit) -> Unit,
  onSignUp: (email: String, pass: String, onResult: (Boolean, String?) -> Unit) -> Unit,
  onClose: () -> Unit,
  modifier: Modifier = Modifier
) {
  var isLoginMode by remember { mutableStateOf(true) }
  var email by remember { mutableStateOf("") }
  var password by remember { mutableStateOf("") }
  var errorMessage by remember { mutableStateOf<String?>(null) }
  var successMessage by remember { mutableStateOf<String?>(null) }

  val isSeller = role == "seller"
  val scrollState = rememberScrollState()

  Column(
    modifier = modifier
      .fillMaxSize()
      .background(NearKartBg)
      .verticalScroll(scrollState)
      .testTag("auth_screen")
  ) {
    // Blue Hero Section
    Box(
      modifier = Modifier
        .fillMaxWidth()
        .background(NearKartBlue)
        .statusBarsPadding()
        .padding(20.dp)
    ) {
      Column {
        IconButton(onClick = onClose, modifier = Modifier.testTag("auth_back_button")) {
          Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back", tint = Color.White)
        }
        Spacer(modifier = Modifier.height(12.dp))
        NearKartLogo(fontSize = 30)
        Spacer(modifier = Modifier.height(14.dp))
        Text(
          text = if (isSeller) Localization.tr("Become a NearKart Partner", lang) else Localization.tr("Welcome to NearKart", lang),
          fontSize = 24.sp,
          fontWeight = FontWeight.ExtraBold,
          color = Color.White
        )
        Text(
          text = if (isSeller) Localization.tr("Sell your products online and reach shoppers near you", lang) else Localization.tr("Login or sign up to continue", lang),
          color = Color(0xFFCFDCF7),
          fontSize = 14.sp,
          modifier = Modifier.padding(top = 4.dp)
        )
      }
    }

    // Input Card
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
          text = if (isLoginMode) Localization.tr("Login", lang) else Localization.tr("Create a new account", lang),
          fontWeight = FontWeight.ExtraBold,
          fontSize = 18.sp,
          color = NearKartInk
        )
        Spacer(modifier = Modifier.height(14.dp))

        OutlinedTextField(
          value = email,
          onValueChange = { email = it },
          label = { Text(Localization.tr("Email", lang)) },
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("auth_email_input")
        )

        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
          value = password,
          onValueChange = { password = it },
          label = { Text(Localization.tr("Password (6+ characters)", lang)) },
          visualTransformation = PasswordVisualTransformation(),
          keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
          shape = RoundedCornerShape(12.dp),
          colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = NearKartBlue,
            unfocusedBorderColor = NearKartLine
          ),
          modifier = Modifier.fillMaxWidth().testTag("auth_password_input")
        )

        errorMessage?.let { err ->
          Spacer(modifier = Modifier.height(8.dp))
          Text(text = err, color = NearKartRed, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }

        successMessage?.let { msg ->
          Spacer(modifier = Modifier.height(8.dp))
          Text(text = msg, color = NearKartBlue, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.height(16.dp))
        Button(
          onClick = {
            if (!email.contains("@") || password.length < 6) {
              errorMessage = "Enter a valid email and a password of 6+ characters"
              return@Button
            }
            errorMessage = null
            if (isLoginMode) {
              onLogin(email.trim(), password) { success, err ->
                if (!success) {
                  errorMessage = err
                }
              }
            } else {
              onSignUp(email.trim(), password) { success, msg ->
                if (success) {
                  successMessage = msg ?: "Account created! Please log in."
                  errorMessage = null
                  isLoginMode = true
                } else {
                  errorMessage = msg
                  successMessage = null
                }
              }
            }
          },
          enabled = !isLoading,
          colors = ButtonDefaults.buttonColors(containerColor = NearKartBlue),
          shape = RoundedCornerShape(14.dp),
          modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .testTag("auth_submit_button")
        ) {
          if (isLoading) {
            CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp)
          } else {
            Text(
              text = if (isLoginMode) Localization.tr("Login", lang) else Localization.tr("Create account", lang),
              fontWeight = FontWeight.Bold,
              fontSize = 16.sp
            )
          }
        }

        Spacer(modifier = Modifier.height(10.dp))
        OutlinedButton(
          onClick = {
            isLoginMode = !isLoginMode
            errorMessage = null
            successMessage = null
          },
          border = androidx.compose.foundation.BorderStroke(1.dp, NearKartBlue),
          shape = RoundedCornerShape(14.dp),
          modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .testTag("switch_auth_mode_button")
        ) {
          Text(
            text = if (isLoginMode) Localization.tr("Create a new account", lang) else Localization.tr("Already have an account? Log in", lang),
            color = NearKartBlue,
            fontWeight = FontWeight.Bold,
            fontSize = 13.sp
          )
        }

        Spacer(modifier = Modifier.height(12.dp))
        Text(
          text = Localization.tr("Email login is for testing. Phone OTP will come at launch.", lang),
          color = NearKartMute,
          fontSize = 11.sp
        )
      }
    }

    Spacer(modifier = Modifier.height(8.dp))
    OutlinedButton(
      onClick = onClose,
      shape = RoundedCornerShape(14.dp),
      border = androidx.compose.foundation.BorderStroke(1.dp, NearKartLine),
      modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 14.dp)
        .height(48.dp)
    ) {
      Text(
        text = Localization.tr("Continue browsing", lang),
        color = NearKartMute,
        fontWeight = FontWeight.Bold
      )
    }

    Spacer(modifier = Modifier.height(30.dp))
  }
}
