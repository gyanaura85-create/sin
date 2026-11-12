package com.example.data.local

import android.content.Context
import android.content.SharedPreferences
import com.example.data.model.UserLocation
import com.example.data.model.UserProfile
import com.example.data.model.UserSession
import org.json.JSONObject

class LocalStore(context: Context) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences("nearkart_prefs", Context.MODE_PRIVATE)

  var language: String
    get() = prefs.getString("key_lang", "en") ?: "en"
    set(value) = prefs.edit().putString("key_lang", value).apply()

  var vibrationEnabled: Boolean
    get() = prefs.getBoolean("key_vib", true)
    set(value) = prefs.edit().putBoolean("key_vib", value).apply()

  fun saveSession(session: UserSession?) {
    if (session == null) {
      prefs.edit().remove("key_session").apply()
      return
    }
    val json = JSONObject().apply {
      put("token", session.token)
      put("refresh", session.refresh)
      put("uid", session.uid)
      put("email", session.email)
      put("role", session.role)
      put("expiresAt", session.expiresAt)
    }
    prefs.edit().putString("key_session", json.toString()).apply()
  }

  fun getSession(): UserSession? {
    val str = prefs.getString("key_session", null) ?: return null
    return try {
      val json = JSONObject(str)
      UserSession(
        token = json.getString("token"),
        refresh = json.optString("refresh", ""),
        uid = json.getString("uid"),
        email = json.getString("email"),
        role = json.optString("role", "buyer"),
        expiresAt = json.optLong("expiresAt", 0L)
      )
    } catch (_: Exception) {
      null
    }
  }

  fun saveProfile(profile: UserProfile) {
    val json = JSONObject().apply {
      put("name", profile.name)
      put("phone", profile.phone)
      put("address", profile.address)
      put("area", profile.area)
      put("location", profile.location)
      put("role", profile.role)
    }
    prefs.edit().putString("key_profile", json.toString()).apply()
  }

  fun getProfile(): UserProfile {
    val str = prefs.getString("key_profile", null) ?: return UserProfile()
    return try {
      val json = JSONObject(str)
      UserProfile(
        name = json.optString("name", ""),
        phone = json.optString("phone", ""),
        address = json.optString("address", ""),
        area = json.optString("area", ""),
        location = json.optString("location", ""),
        role = json.optString("role", "buyer")
      )
    } catch (_: Exception) {
      UserProfile()
    }
  }

  fun saveLocation(loc: UserLocation) {
    val json = JSONObject().apply {
      put("area", loc.area)
      put("fullAddress", loc.fullAddress)
      loc.lat?.let { put("lat", it) }
      loc.lng?.let { put("lng", it) }
    }
    prefs.edit().putString("key_location", json.toString()).apply()
  }

  fun getLocation(): UserLocation {
    val str = prefs.getString("key_location", null) ?: return UserLocation("Market Chowk, Sector 4")
    return try {
      val json = JSONObject(str)
      UserLocation(
        area = json.optString("area", "Market Chowk, Sector 4"),
        fullAddress = json.optString("fullAddress", ""),
        lat = if (json.has("lat")) json.getDouble("lat") else null,
        lng = if (json.has("lng")) json.getDouble("lng") else null
      )
    } catch (_: Exception) {
      UserLocation("Market Chowk, Sector 4")
    }
  }
}
