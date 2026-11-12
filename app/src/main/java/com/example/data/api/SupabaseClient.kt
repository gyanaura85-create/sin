package com.example.data.api

import android.util.Log
import com.example.data.model.Order
import com.example.data.model.OrderItem
import com.example.data.model.Product
import com.example.data.model.Shop
import com.example.data.model.UserProfile
import com.example.data.model.UserSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SupabaseClient {
  companion object {
    private const val TAG = "SupabaseClient"
    const val BASE_URL = "https://mfdiicegsgbcbvyeuxgi.supabase.co"
    const val API_KEY = "sb_publishable_I_ypFDUGPQdtct0U5FMhAQ_02rIepBx"
    private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
  }

  private val client = OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .writeTimeout(20, TimeUnit.SECONDS)
    .build()

  suspend fun makeRequest(
    path: String,
    method: String = "GET",
    bodyJson: String? = null,
    token: String? = null
  ): String = withContext(Dispatchers.IO) {
    val builder = Request.Builder()
      .url(BASE_URL + path)
      .addHeader("apikey", API_KEY)
      .addHeader("Content-Type", "application/json")

    if (!token.isNullOrBlank()) {
      builder.addHeader("Authorization", "Bearer $token")
    }

    when (method.uppercase()) {
      "GET" -> builder.get()
      "POST" -> {
        val reqBody = (bodyJson ?: "{}").toRequestBody(JSON_MEDIA)
        builder.post(reqBody)
      }
      "PATCH" -> {
        val reqBody = (bodyJson ?: "{}").toRequestBody(JSON_MEDIA)
        builder.patch(reqBody)
      }
      "DELETE" -> builder.delete()
      else -> builder.get()
    }

    client.newCall(builder.build()).execute().use { response ->
      val resString = response.body?.string() ?: ""
      if (!response.isSuccessful) {
        var errorMsg = "HTTP ${response.code}"
        try {
          val errObj = JSONObject(resString)
          errorMsg = errObj.optString(
            "message",
            errObj.optString(
              "msg",
              errObj.optString("error_description", errObj.optString("error", errorMsg))
            )
          )
        } catch (_: Exception) {}
        throw Exception(cleanErrorMessage(Exception(errorMsg)))
      }
      resString
    }
  }

  fun cleanErrorMessage(e: Throwable): String {
    val m = e.message ?: "Something went wrong"
    if (m.contains("invalid login credentials", ignoreCase = true)) {
      return "Wrong email or password."
    }
    if (m.contains("already registered", ignoreCase = true) ||
      m.contains("already exists", ignoreCase = true) ||
      m.contains("user already", ignoreCase = true)
    ) {
      return "This email is already registered. Please log in."
    }
    if (m.contains("email not confirmed", ignoreCase = true)) {
      return "Please confirm your email first, then log in."
    }
    if (m.contains("jwt", ignoreCase = true) ||
      m.contains("not authenticated", ignoreCase = true) ||
      m.contains("not logged in", ignoreCase = true)
    ) {
      return "Session expired. Please log in again."
    }
    if (m.contains("23505") || m.contains("duplicate", ignoreCase = true)) {
      return "This order was already submitted. Please check My Orders."
    }
    if (m.contains("42501") || m.contains("permission denied", ignoreCase = true)) {
      return "Permission denied on database."
    }
    return m
  }

  // --- Auth API ---
  suspend fun login(email: String, pass: String): UserSession {
    val body = JSONObject().apply {
      put("email", email)
      put("password", pass)
    }
    val res = makeRequest("/auth/v1/token?grant_type=password", "POST", body.toString())
    val obj = JSONObject(res)
    val userObj = obj.getJSONObject("user")
    val userMeta = userObj.optJSONObject("user_metadata")
    val role = userMeta?.optString("role", "buyer") ?: "buyer"

    return UserSession(
      token = obj.getString("access_token"),
      refresh = obj.optString("refresh_token", ""),
      uid = userObj.getString("id"),
      email = userObj.getString("email"),
      role = role,
      expiresAt = System.currentTimeMillis() + (obj.optLong("expires_in", 3600L) * 1000L)
    )
  }

  suspend fun signUp(email: String, pass: String, role: String): UserSession? {
    val body = JSONObject().apply {
      put("email", email)
      put("password", pass)
      put("data", JSONObject().put("role", role))
    }
    val res = makeRequest("/auth/v1/signup", "POST", body.toString())
    val obj = JSONObject(res)
    if (obj.has("access_token")) {
      val userObj = obj.optJSONObject("user") ?: JSONObject()
      val userMeta = userObj.optJSONObject("user_metadata")
      val actualRole = userMeta?.optString("role", role) ?: role
      return UserSession(
        token = obj.getString("access_token"),
        refresh = obj.optString("refresh_token", ""),
        uid = userObj.optString("id", obj.optString("id", "")),
        email = userObj.optString("email", email),
        role = actualRole,
        expiresAt = System.currentTimeMillis() + (obj.optLong("expires_in", 3600L) * 1000L)
      )
    }
    return null
  }

  // --- User Profile ---
  suspend fun fetchProfile(uid: String, token: String): UserProfile? {
    val cols = listOf("id", "user_id")
    for (col in cols) {
      try {
        val res = makeRequest("/rest/v1/profiles?$col=eq.$uid&select=*", "GET", token = token)
        val array = JSONArray(res)
        if (array.length() > 0) {
          val o = array.getJSONObject(0)
          return UserProfile(
            name = o.optString("name", ""),
            phone = o.optString("phone", ""),
            address = o.optString("address", ""),
            area = o.optString("area", ""),
            location = o.optString("location", ""),
            role = o.optString("role", "buyer")
          )
        }
      } catch (_: Exception) {}
    }
    return null
  }

  suspend fun updateMyProfile(
    name: String?,
    phone: String?,
    location: String?,
    area: String?,
    address: String?,
    token: String
  ) {
    val body = JSONObject().apply {
      put("p_name", name ?: JSONObject.NULL)
      put("p_phone", phone ?: JSONObject.NULL)
      put("p_location", location ?: JSONObject.NULL)
      put("p_area", area ?: JSONObject.NULL)
      put("p_address", address ?: JSONObject.NULL)
    }
    makeRequest("/rest/v1/rpc/update_my_profile", "POST", body.toString(), token)
  }

  // --- Public Shops ---
  suspend fun getPublicShops(): List<Shop> {
    return try {
      val res = makeRequest("/rest/v1/rpc/get_public_shops", "POST", "{}")
      parseShopList(res)
    } catch (e: Exception) {
      Log.w(TAG, "get_public_shops fallback: ${e.message}")
      try {
        val res = makeRequest("/rest/v1/shops?select=*")
        parseShopList(res)
      } catch (_: Exception) {
        emptyList()
      }
    }
  }

  private fun parseShopList(jsonStr: String): List<Shop> {
    val list = mutableListOf<Shop>()
    val array = try {
      JSONArray(jsonStr)
    } catch (e: Exception) {
      val obj = JSONObject(jsonStr)
      obj.optJSONArray("shops") ?: obj.optJSONArray("data") ?: JSONArray()
    }
    for (i in 0 until array.length()) {
      val o = array.getJSONObject(i)
      list.add(
        Shop(
          id = o.optString("id", i.toString()),
          name = o.optString("name", "Shop $i"),
          ownerName = o.optString("owner_name", null),
          phone = o.optString("phone", ""),
          area = o.optString("area", ""),
          category = o.optString("category", "Grocery"),
          photoUrl = if (o.isNull("photo_url")) null else o.optString("photo_url"),
          isOpen = o.optBoolean("is_open", true),
          rating = o.optDouble("rating", 0.0),
          ratingCount = o.optInt("rating_count", 0),
          offer = if (o.isNull("offer")) null else o.optString("offer"),
          upiId = if (o.isNull("upi_id")) null else o.optString("upi_id"),
          qrUrl = if (o.isNull("qr_url")) null else o.optString("qr_url")
        )
      )
    }
    return list
  }

  // --- Products ---
  suspend fun getPublicProducts(): List<Product> {
    return try {
      val res = makeRequest("/rest/v1/products?active=eq.true&select=*&order=name&limit=60")
      parseProductList(res)
    } catch (e: Exception) {
      Log.w(TAG, "getPublicProducts failed: ${e.message}")
      emptyList()
    }
  }

  suspend fun getShopProducts(shopId: String): List<Product> {
    return try {
      val res = makeRequest("/rest/v1/products?shop_id=eq.$shopId&active=eq.true&select=*&order=name")
      parseProductList(res)
    } catch (e: Exception) {
      emptyList()
    }
  }

  private fun parseProductList(jsonStr: String): List<Product> {
    val list = mutableListOf<Product>()
    val array = try {
      JSONArray(jsonStr)
    } catch (_: Exception) {
      val obj = JSONObject(jsonStr)
      obj.optJSONArray("products") ?: obj.optJSONArray("data") ?: JSONArray()
    }
    for (i in 0 until array.length()) {
      val o = array.getJSONObject(i)
      list.add(
        Product(
          id = o.optString("id", i.toString()),
          shopId = o.optString("shop_id", ""),
          name = o.optString("name", "Product $i"),
          category = o.optString("category", "Other"),
          unit = o.optString("unit", "kg"),
          price = o.optDouble("price", 0.0),
          originalPrice = if (o.isNull("original_price")) null else o.optDouble("original_price"),
          onlineQty = o.optDouble("online_qty", 0.0),
          shopQty = o.optDouble("shop_qty", 0.0),
          lowAlert = o.optDouble("low_alert", 5.0),
          description = if (o.isNull("description")) null else o.optString("description"),
          imageUrl = if (o.isNull("image_url")) null else o.optString("image_url"),
          active = o.optBoolean("active", true),
          stockVersion = if (o.isNull("stock_version")) null else o.optInt("stock_version")
        )
      )
    }
    return list
  }

  // --- Orders ---
  suspend fun placeOrder(
    shopId: String,
    items: List<Pair<String, Double>>,
    name: String,
    phone: String,
    address: String,
    deliveryType: String,
    paymentMethod: String,
    token: String
  ): String {
    val itemsArray = JSONArray()
    items.forEach { (pId, qty) ->
      itemsArray.put(JSONObject().apply {
        put("product_id", pId)
        put("qty", qty)
      })
    }
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      put("p_items", itemsArray)
      put("p_customer_name", name)
      put("p_customer_phone", phone)
      put("p_customer_address", address)
      put("p_delivery_type", deliveryType)
      put("p_payment_method", paymentMethod)
    }
    val res = makeRequest("/rest/v1/rpc/place_order", "POST", body.toString(), token)
    return try {
      val obj = JSONObject(res)
      obj.optString("order_id", obj.optString("id", System.currentTimeMillis().toString()))
    } catch (_: Exception) {
      res.trim('\"', ' ', '[', ']')
    }
  }

  suspend fun submitOrderUtr(orderId: String, utr: String, token: String) {
    val body = JSONObject().apply {
      put("p_order", orderId)
      put("p_utr", utr)
    }
    makeRequest("/rest/v1/rpc/submit_order_utr", "POST", body.toString(), token)
  }

  suspend fun getMyOrders(token: String, limit: Int = 30): List<Order> {
    val body = JSONObject().apply {
      put("p_limit", limit)
      put("p_offset", 0)
    }
    val res = makeRequest("/rest/v1/rpc/get_my_orders_paginated", "POST", body.toString(), token)
    return parseOrderList(res)
  }

  suspend fun getShopOrders(shopId: String, token: String, limit: Int = 50): List<Order> {
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      put("p_limit", limit)
      put("p_offset", 0)
    }
    val res = makeRequest("/rest/v1/rpc/get_shop_orders_paginated", "POST", body.toString(), token)
    return parseOrderList(res)
  }

  suspend fun setOrderStatus(orderId: String, status: String, reason: String? = null, token: String) {
    val body = JSONObject().apply {
      put("p_order", orderId)
      put("p_status", status)
      if (reason != null) put("p_reason", reason)
    }
    makeRequest("/rest/v1/rpc/set_order_status", "POST", body.toString(), token)
  }

  suspend fun verifyOrderPayment(orderId: String, verified: Boolean, token: String) {
    val body = JSONObject().apply {
      put("p_order", orderId)
      put("p_verified", verified)
    }
    makeRequest("/rest/v1/rpc/verify_order_payment", "POST", body.toString(), token)
  }

  // --- Seller Shop & Products ---
  suspend fun getMyShop(token: String): Shop? {
    return try {
      val res = makeRequest("/rest/v1/rpc/get_my_shop", "POST", "{}", token)
      val parsed = parseShopList(if (res.trim().startsWith("[")) res else "[$res]")
      parsed.firstOrNull()
    } catch (_: Exception) {
      null
    }
  }

  suspend fun registerMyShop(
    name: String,
    owner: String,
    phone: String,
    area: String,
    category: String,
    photoUrl: String?,
    token: String
  ): Shop {
    val body = JSONObject().apply {
      put("p_name", name)
      put("p_owner_name", owner)
      put("p_phone", phone)
      put("p_area", area)
      put("p_category", category)
      if (!photoUrl.isNullOrBlank()) put("p_photo_url", photoUrl)
    }
    val res = makeRequest("/rest/v1/rpc/register_my_shop", "POST", body.toString(), token)
    val parsed = parseShopList(if (res.trim().startsWith("[")) res else "[$res]")
    return parsed.first()
  }

  suspend fun updateMyShop(
    shopId: String,
    isOpen: Boolean? = null,
    offer: String? = null,
    token: String
  ) {
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      if (isOpen != null) put("p_is_open", isOpen)
      if (offer != null) {
        put("p_offer", offer)
        put("p_update_offer", true)
      }
    }
    makeRequest("/rest/v1/rpc/update_my_shop", "POST", body.toString(), token)
  }

  suspend fun getShopPayment(shopId: String): Pair<String?, String?> {
    return try {
      val body = JSONObject().put("p_shop_id", shopId)
      val res = makeRequest("/rest/v1/rpc/get_shop_payment", "POST", body.toString())
      val obj = try {
        val arr = JSONArray(res)
        if (arr.length() > 0) arr.getJSONObject(0) else JSONObject()
      } catch (_: Exception) {
        JSONObject(res)
      }
      val upi = if (obj.isNull("upi_id")) null else obj.optString("upi_id")
      val qr = if (obj.isNull("qr_url")) null else obj.optString("qr_url")
      upi to qr
    } catch (_: Exception) {
      null to null
    }
  }

  suspend fun updateMyPayment(shopId: String, upiId: String?, qrUrl: String?, token: String) {
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      if (upiId != null) put("p_upi_id", upiId)
      if (qrUrl != null) put("p_qr_url", qrUrl)
    }
    makeRequest("/rest/v1/rpc/update_my_payment", "POST", body.toString(), token)
  }

  suspend fun getSellerProducts(shopId: String, token: String): List<Product> {
    return try {
      val body = JSONObject().put("p_shop_id", shopId)
      val res = makeRequest("/rest/v1/rpc/seller_get_products", "POST", body.toString(), token)
      parseProductList(res)
    } catch (_: Exception) {
      emptyList()
    }
  }

  suspend fun saveSellerProduct(
    shopId: String,
    productId: String?,
    product: Product,
    token: String
  ) {
    val prodObj = JSONObject().apply {
      put("name", product.name)
      put("category", product.category)
      put("unit", product.unit)
      put("price", product.price)
      if (product.originalPrice != null) put("original_price", product.originalPrice)
      put("description", product.description ?: JSONObject.NULL)
      put("image_url", product.imageUrl ?: JSONObject.NULL)
      put("low_alert", product.lowAlert)
      put("active", product.active)
      if (productId == null) {
        put("online_qty", product.onlineQty)
        put("shop_qty", product.shopQty)
      }
    }
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      put("p_product_id", productId ?: JSONObject.NULL)
      put("p_product", prodObj)
    }
    makeRequest("/rest/v1/rpc/seller_save_product", "POST", body.toString(), token)
  }

  suspend fun setProductActive(shopId: String, productId: String, active: Boolean, token: String) {
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      put("p_product_id", productId)
      put("p_active", active)
    }
    makeRequest("/rest/v1/rpc/seller_set_product_active", "POST", body.toString(), token)
  }

  suspend fun updateShopProductStock(
    shopId: String,
    productId: String,
    onlineQty: Double,
    shopQty: Double,
    expectedVersion: Int?,
    token: String
  ) {
    val body = JSONObject().apply {
      put("p_shop_id", shopId)
      put("p_product_id", productId)
      put("p_online_qty", onlineQty)
      put("p_shop_qty", shopQty)
      if (expectedVersion != null) put("p_expected_version", expectedVersion)
    }
    makeRequest("/rest/v1/rpc/update_shop_product_stock", "POST", body.toString(), token)
  }

  private fun parseOrderList(jsonStr: String): List<Order> {
    val list = mutableListOf<Order>()
    val array = try {
      JSONArray(jsonStr)
    } catch (_: Exception) {
      val obj = JSONObject(jsonStr)
      obj.optJSONArray("orders") ?: obj.optJSONArray("data") ?: JSONArray()
    }
    for (i in 0 until array.length()) {
      val o = array.getJSONObject(i)
      val itemsList = mutableListOf<OrderItem>()
      val itemsArray = o.optJSONArray("order_items") ?: o.optJSONArray("items") ?: JSONArray()
      for (j in 0 until itemsArray.length()) {
        val it = itemsArray.getJSONObject(j)
        itemsList.add(
          OrderItem(
            id = it.optString("id", "$i-$j"),
            productId = it.optString("product_id", ""),
            name = it.optString("name", "Item $j"),
            price = it.optDouble("price", 0.0),
            qty = it.optDouble("qty", 1.0),
            unit = it.optString("unit", "kg")
          )
        )
      }

      val shopsObj = o.optJSONObject("shops")
      val shopName = shopsObj?.optString("name") ?: o.optString("shop_name", null)
      val shopPhone = shopsObj?.optString("phone") ?: o.optString("shop_phone", null)

      list.add(
        Order(
          id = o.optString("id", i.toString()),
          orderNumber = if (o.isNull("order_number")) null else o.optLong("order_number"),
          shopId = o.optString("shop_id", ""),
          userId = o.optString("user_id", null),
          status = o.optString("status", "new"),
          customerName = o.optString("customer_name", o.optString("name", "")),
          customerPhone = o.optString("customer_phone", o.optString("phone", "")),
          customerAddress = o.optString("customer_address", o.optString("address", "")),
          deliveryType = o.optString("delivery_type", "delivery"),
          paymentMethod = o.optString("payment_method", "cod"),
          total = o.optDouble("total", 0.0),
          createdAt = o.optString("created_at", ""),
          updatedAt = o.optString("updated_at", ""),
          cancelReason = if (o.isNull("cancel_reason")) null else o.optString("cancel_reason"),
          orderItems = itemsList,
          shopName = shopName,
          shopPhone = shopPhone,
          utrNumber = if (o.isNull("utr_number")) null else o.optString("utr_number"),
          paymentStatus = if (o.isNull("payment_status")) null else o.optString("payment_status")
        )
      )
    }
    return list
  }
}
