package com.example.ui

import android.app.Application
import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.api.SupabaseClient
import com.example.data.local.LocalStore
import com.example.data.localization.Localization
import com.example.data.model.Cart
import com.example.data.model.CartItem
import com.example.data.model.Order
import com.example.data.model.Product
import com.example.data.model.Shop
import com.example.data.model.UserLocation
import com.example.data.model.UserProfile
import com.example.data.model.UserSession
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class NearKartUiState(
  val language: String = Localization.EN,
  val isLoading: Boolean = false,
  val errorMessage: String? = null,
  val session: UserSession? = null,
  val profile: UserProfile = UserProfile(),
  val location: UserLocation = UserLocation(),
  val shops: List<Shop> = emptyList(),
  val products: List<Product> = emptyList(),
  val cart: Cart? = null,
  val buyerOrders: List<Order> = emptyList(),
  // Seller State
  val myShop: Shop? = null,
  val sellerOrders: List<Order> = emptyList(),
  val sellerProducts: List<Product> = emptyList(),
  val vibrationEnabled: Boolean = true,
  val newOrderAlert: String? = null,
  val lastPlacedOrder: Order? = null
)

class NearKartViewModel(application: Application) : AndroidViewModel(application) {
  private val api = SupabaseClient()
  private val localStore = LocalStore(application)

  private val _uiState = MutableStateFlow(
    NearKartUiState(
      language = localStore.language,
      session = localStore.getSession(),
      profile = localStore.getProfile(),
      location = localStore.getLocation(),
      vibrationEnabled = localStore.vibrationEnabled,
      shops = emptyList(),
      products = emptyList()
    )
  )
  val uiState: StateFlow<NearKartUiState> = _uiState.asStateFlow()

  private var previousNewOrderCount = 0

  init {
    loadInitialData()
    startPeriodicSync()
  }

  fun setLanguage(lang: String) {
    localStore.language = lang
    _uiState.value = _uiState.value.copy(language = lang)
  }

  fun setLocation(location: UserLocation) {
    localStore.saveLocation(location)
    _uiState.value = _uiState.value.copy(location = location)
    val sess = _uiState.value.session
    if (sess != null) {
      viewModelScope.launch {
        try {
          api.updateMyProfile(
            name = _uiState.value.profile.name,
            phone = _uiState.value.profile.phone,
            location = location.fullAddress.ifBlank { location.area },
            area = location.area,
            address = _uiState.value.profile.address,
            token = sess.token
          )
        } catch (_: Exception) {}
      }
    }
  }

  fun toggleVibration(enabled: Boolean) {
    localStore.vibrationEnabled = enabled
    _uiState.value = _uiState.value.copy(vibrationEnabled = enabled)
  }

  fun clearNewOrderAlert() {
    _uiState.value = _uiState.value.copy(newOrderAlert = null)
  }

  fun clearErrorMessage() {
    _uiState.value = _uiState.value.copy(errorMessage = null)
  }

  fun clearLastPlacedOrder() {
    _uiState.value = _uiState.value.copy(lastPlacedOrder = null)
  }

  // --- Real Supabase Data Loading ---
  fun loadInitialData() {
    viewModelScope.launch {
      _uiState.value = _uiState.value.copy(isLoading = true)
      try {
        val remoteShops = api.getPublicShops()
        val remoteProducts = api.getPublicProducts()

        val shopMap = remoteShops.associateBy { it.id }
        val mappedProducts = remoteProducts.map { p ->
          p.copy(shopName = shopMap[p.shopId]?.name)
        }

        _uiState.value = _uiState.value.copy(
          shops = remoteShops,
          products = mappedProducts,
          isLoading = false
        )

        val sess = _uiState.value.session
        if (sess != null) {
          // Fetch real user profile from Supabase
          try {
            val remoteProfile = api.fetchProfile(sess.uid, sess.token)
            if (remoteProfile != null) {
              val effectiveRole = if (remoteProfile.role.isNotBlank()) remoteProfile.role else sess.role
              val updatedSession = sess.copy(role = effectiveRole)
              localStore.saveSession(updatedSession)
              localStore.saveProfile(remoteProfile)
              _uiState.value = _uiState.value.copy(
                session = updatedSession,
                profile = remoteProfile
              )
            }
          } catch (e: Exception) {
            Log.w("NearKartVM", "fetchProfile: ${e.message}")
          }

          if (sess.role == "seller") {
            loadSellerData(sess)
          } else {
            loadBuyerOrders(sess)
          }
        }
      } catch (e: Exception) {
        Log.e("NearKartVM", "loadInitialData failed", e)
        _uiState.value = _uiState.value.copy(
          isLoading = false,
          errorMessage = api.cleanErrorMessage(e)
        )
      }
    }
  }

  private fun startPeriodicSync() {
    viewModelScope.launch {
      while (true) {
        delay(12000L) // Poll every 12 seconds for real incoming orders
        val sess = _uiState.value.session
        if (sess != null) {
          if (sess.role == "seller" && _uiState.value.myShop != null) {
            refreshSellerOrdersSilently(sess, _uiState.value.myShop!!.id)
          } else if (sess.role == "buyer") {
            refreshBuyerOrdersSilently(sess)
          }
        }
      }
    }
  }

  // --- Real Supabase Auth Flow ---
  fun login(email: String, pass: String, role: String, onComplete: (Boolean, String?) -> Unit) {
    viewModelScope.launch {
      _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
      try {
        val sess = api.login(email.trim(), pass)
        // Fetch remote profile from Supabase to check role and details
        val remoteProfile = try {
          api.fetchProfile(sess.uid, sess.token)
        } catch (_: Exception) {
          null
        }

        val effectiveRole = if (!remoteProfile?.role.isNullOrBlank()) {
          remoteProfile!!.role
        } else {
          role
        }

        val fullSession = sess.copy(role = effectiveRole)
        localStore.saveSession(fullSession)

        val effectiveProfile = remoteProfile ?: UserProfile(role = effectiveRole)
        localStore.saveProfile(effectiveProfile)

        _uiState.value = _uiState.value.copy(
          session = fullSession,
          profile = effectiveProfile,
          isLoading = false
        )

        if (effectiveRole == "seller") {
          loadSellerData(fullSession)
        } else {
          loadBuyerOrders(fullSession)
        }
        onComplete(true, null)
      } catch (e: Exception) {
        val msg = api.cleanErrorMessage(e)
        Log.e("NearKartVM", "Real login failed: $msg", e)
        _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
        onComplete(false, msg)
      }
    }
  }

  fun signUp(email: String, pass: String, role: String, onComplete: (Boolean, String?) -> Unit) {
    viewModelScope.launch {
      _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
      try {
        val maybeSession = api.signUp(email.trim(), pass, role)
        if (maybeSession != null) {
          localStore.saveSession(maybeSession)
          val profile = UserProfile(role = maybeSession.role)
          localStore.saveProfile(profile)
          _uiState.value = _uiState.value.copy(
            session = maybeSession,
            profile = profile,
            isLoading = false
          )
          if (maybeSession.role == "seller") {
            loadSellerData(maybeSession)
          } else {
            loadBuyerOrders(maybeSession)
          }
          onComplete(true, "Welcome! You are now logged in.")
        } else {
          _uiState.value = _uiState.value.copy(isLoading = false)
          onComplete(true, "Account created. Please log in.")
        }
      } catch (e: Exception) {
        val msg = api.cleanErrorMessage(e)
        Log.e("NearKartVM", "Real signup failed: $msg", e)
        _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
        onComplete(false, msg)
      }
    }
  }

  fun logout() {
    localStore.saveSession(null)
    _uiState.value = _uiState.value.copy(
      session = null,
      myShop = null,
      sellerOrders = emptyList(),
      sellerProducts = emptyList(),
      buyerOrders = emptyList(),
      cart = null,
      lastPlacedOrder = null
    )
    loadInitialData()
  }

  fun saveProfile(profile: UserProfile, onComplete: (String?) -> Unit) {
    localStore.saveProfile(profile)
    _uiState.value = _uiState.value.copy(profile = profile)

    val sess = _uiState.value.session
    if (sess != null) {
      viewModelScope.launch {
        try {
          api.updateMyProfile(
            name = profile.name.trim().ifBlank { null },
            phone = profile.phone.trim().ifBlank { null },
            location = _uiState.value.location.fullAddress.ifBlank { _uiState.value.location.area },
            area = _uiState.value.location.area,
            address = profile.address.trim().ifBlank { null },
            token = sess.token
          )
          onComplete(null)
        } catch (e: Exception) {
          val msg = api.cleanErrorMessage(e)
          onComplete(msg)
        }
      }
    } else {
      onComplete(null)
    }
  }

  // --- Real Cart & Checkout Flow ---
  fun addToCart(shop: Shop, product: Product, qty: Double) {
    val currentCart = _uiState.value.cart
    val newCart = if (currentCart == null || currentCart.shop.id != shop.id) {
      Cart(shop = shop, items = mapOf(product.id to CartItem(product, qty)))
    } else {
      val mutableItems = currentCart.items.toMutableMap()
      if (qty <= 0.0) {
        mutableItems.remove(product.id)
      } else {
        mutableItems[product.id] = CartItem(product, qty)
      }
      currentCart.copy(items = mutableItems)
    }
    _uiState.value = _uiState.value.copy(cart = if (newCart.items.isEmpty()) null else newCart)
  }

  fun removeFromCart(productId: String) {
    val currentCart = _uiState.value.cart ?: return
    val mutableItems = currentCart.items.toMutableMap()
    mutableItems.remove(productId)
    _uiState.value = _uiState.value.copy(
      cart = if (mutableItems.isEmpty()) null else currentCart.copy(items = mutableItems)
    )
  }

  fun clearCart() {
    _uiState.value = _uiState.value.copy(cart = null)
  }

  fun placeOrder(
    deliveryType: String,
    paymentMethod: String,
    utr: String,
    onComplete: (Boolean, String?) -> Unit
  ) {
    val currentCart = _uiState.value.cart ?: run {
      onComplete(false, "Cart is empty")
      return
    }
    val sess = _uiState.value.session ?: run {
      onComplete(false, "Please log in to place an order")
      return
    }
    val prof = _uiState.value.profile

    if (prof.name.isBlank() || prof.phone.isBlank()) {
      onComplete(false, "Please enter name and 10-digit phone")
      return
    }
    if (deliveryType == "delivery" && prof.address.isBlank()) {
      onComplete(false, "Please enter your full delivery address")
      return
    }
    if (paymentMethod == "upi" && utr.length != 12) {
      onComplete(false, "Pay first, then enter the 12-digit UTR number to place the order.")
      return
    }

    viewModelScope.launch {
      _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
      try {
        val orderId = api.placeOrder(
          shopId = currentCart.shop.id,
          items = currentCart.items.values.map { it.product.id to it.qty },
          name = prof.name.trim(),
          phone = prof.phone.trim(),
          address = if (deliveryType == "pickup" && prof.address.isBlank()) "Pickup from shop" else prof.address.trim(),
          deliveryType = deliveryType,
          paymentMethod = paymentMethod,
          token = sess.token
        )

        if (paymentMethod == "upi") {
          try {
            api.submitOrderUtr(orderId, utr.trim(), sess.token)
          } catch (e2: Exception) {
            Log.w("NearKartVM", "submitOrderUtr: ${e2.message}")
          }
        }

        // Reload real orders from Supabase
        val freshOrders = api.getMyOrders(sess.token)
        val placedOrder = freshOrders.find { it.id == orderId } ?: Order(
          id = orderId,
          shopId = currentCart.shop.id,
          shopName = currentCart.shop.name,
          customerName = prof.name,
          customerPhone = prof.phone,
          customerAddress = prof.address,
          deliveryType = deliveryType,
          paymentMethod = paymentMethod,
          total = currentCart.totalAmount,
          utrNumber = if (paymentMethod == "upi") utr else null,
          paymentStatus = if (paymentMethod == "upi") "pending_verification" else null
        )

        _uiState.value = _uiState.value.copy(
          cart = null,
          buyerOrders = freshOrders.ifEmpty { listOf(placedOrder) },
          lastPlacedOrder = placedOrder,
          isLoading = false
        )

        onComplete(true, null)
      } catch (e: Exception) {
        val msg = api.cleanErrorMessage(e)
        Log.e("NearKartVM", "Real placeOrder failed: $msg", e)
        _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
        onComplete(false, msg)
      }
    }
  }

  // --- Real Buyer Orders ---
  private fun loadBuyerOrders(sess: UserSession) {
    viewModelScope.launch {
      try {
        val orders = api.getMyOrders(sess.token)
        _uiState.value = _uiState.value.copy(buyerOrders = orders)
      } catch (e: Exception) {
        Log.w("NearKartVM", "loadBuyerOrders: ${e.message}")
      }
    }
  }

  private suspend fun refreshBuyerOrdersSilently(sess: UserSession) {
    try {
      val orders = api.getMyOrders(sess.token)
      _uiState.value = _uiState.value.copy(buyerOrders = orders)
    } catch (_: Exception) {}
  }

  fun cancelOrder(orderId: String, reason: String = "Cancelled by customer") {
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        api.setOrderStatus(orderId, "cancelled", reason, sess.token)
        val freshOrders = api.getMyOrders(sess.token)
        _uiState.value = _uiState.value.copy(buyerOrders = freshOrders)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun reorder(order: Order, onComplete: () -> Unit) {
    viewModelScope.launch {
      try {
        val shopProducts = api.getShopProducts(order.shopId)
        val shop = _uiState.value.shops.find { it.id == order.shopId }
          ?: Shop(id = order.shopId, name = order.shopName ?: "Shop", phone = order.shopPhone ?: "")

        val itemsMap = mutableMapOf<String, CartItem>()
        order.orderItems.forEach { item ->
          val prod = shopProducts.find { it.id == item.productId || it.name.equals(item.name, ignoreCase = true) }
          if (prod != null && prod.onlineQty > 0) {
            val qty = minOf(item.qty, prod.onlineQty)
            itemsMap[prod.id] = CartItem(prod, qty)
          }
        }

        if (itemsMap.isNotEmpty()) {
          _uiState.value = _uiState.value.copy(cart = Cart(shop, itemsMap))
          onComplete()
        } else {
          _uiState.value = _uiState.value.copy(errorMessage = "Products are currently out of stock.")
        }
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  // --- Real Seller Hub Flow ---
  fun registerShop(
    name: String,
    owner: String,
    phone: String,
    area: String,
    category: String,
    photoUrl: String?,
    onComplete: (Boolean, String?) -> Unit
  ) {
    val sess = _uiState.value.session ?: run {
      onComplete(false, "Not logged in")
      return
    }

    viewModelScope.launch {
      _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
      try {
        val newShop = api.registerMyShop(name, owner, phone, area, category, photoUrl, sess.token)
        val allShops = api.getPublicShops()

        _uiState.value = _uiState.value.copy(
          myShop = newShop,
          shops = allShops.ifEmpty { listOf(newShop) },
          isLoading = false
        )
        onComplete(true, null)
      } catch (e: Exception) {
        val msg = api.cleanErrorMessage(e)
        Log.e("NearKartVM", "registerShop error: $msg", e)
        _uiState.value = _uiState.value.copy(isLoading = false, errorMessage = msg)
        onComplete(false, msg)
      }
    }
  }

  private fun loadSellerData(sess: UserSession) {
    viewModelScope.launch {
      try {
        val shop = api.getMyShop(sess.token)
        _uiState.value = _uiState.value.copy(myShop = shop)

        if (shop != null) {
          val orders = api.getShopOrders(shop.id, sess.token)
          val prods = api.getSellerProducts(shop.id, sess.token)
          _uiState.value = _uiState.value.copy(
            sellerOrders = orders,
            sellerProducts = prods
          )
        }
      } catch (e: Exception) {
        Log.w("NearKartVM", "loadSellerData: ${e.message}")
      }
    }
  }

  private suspend fun refreshSellerOrdersSilently(sess: UserSession, shopId: String) {
    try {
      val orders = api.getShopOrders(shopId, sess.token)
      val newCount = orders.count { it.status == "new" }
      if (newCount > previousNewOrderCount && previousNewOrderCount != 0) {
        triggerOrderVibration()
        _uiState.value = _uiState.value.copy(newOrderAlert = "🔔 New order received!")
      }
      previousNewOrderCount = newCount
      _uiState.value = _uiState.value.copy(sellerOrders = orders)
    } catch (_: Exception) {}
  }

  fun updateShopOpenStatus(isOpen: Boolean) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    val updatedShop = currentShop.copy(isOpen = isOpen)
    _uiState.value = _uiState.value.copy(
      myShop = updatedShop,
      shops = _uiState.value.shops.map { if (it.id == updatedShop.id) updatedShop else it }
    )
    viewModelScope.launch {
      try {
        api.updateMyShop(currentShop.id, isOpen = isOpen, token = sess.token)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun publishShopOffer(offer: String) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    val updatedShop = currentShop.copy(offer = offer.ifBlank { null })
    _uiState.value = _uiState.value.copy(
      myShop = updatedShop,
      shops = _uiState.value.shops.map { if (it.id == updatedShop.id) updatedShop else it }
    )
    viewModelScope.launch {
      try {
        api.updateMyShop(currentShop.id, offer = offer, token = sess.token)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun updateShopPayment(upiId: String?, qrUrl: String?) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    val updatedShop = currentShop.copy(upiId = upiId, qrUrl = qrUrl)
    _uiState.value = _uiState.value.copy(
      myShop = updatedShop,
      shops = _uiState.value.shops.map { if (it.id == updatedShop.id) updatedShop else it }
    )
    viewModelScope.launch {
      try {
        api.updateMyPayment(currentShop.id, upiId, qrUrl, sess.token)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun updateOrderStatus(orderId: String, status: String, reason: String? = null) {
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        api.setOrderStatus(orderId, status, reason, sess.token)
        _uiState.value.myShop?.let { shop ->
          val freshOrders = api.getShopOrders(shop.id, sess.token)
          _uiState.value = _uiState.value.copy(sellerOrders = freshOrders)
        }
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun verifyOrderPayment(orderId: String, verified: Boolean) {
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        api.verifyOrderPayment(orderId, verified, sess.token)
        _uiState.value.myShop?.let { shop ->
          val freshOrders = api.getShopOrders(shop.id, sess.token)
          _uiState.value = _uiState.value.copy(sellerOrders = freshOrders)
        }
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun bumpStock(product: Product, delta: Double = 10.0) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        val newOnline = product.onlineQty + delta
        api.updateShopProductStock(
          shopId = currentShop.id,
          productId = product.id,
          onlineQty = newOnline,
          shopQty = product.shopQty,
          expectedVersion = product.stockVersion,
          token = sess.token
        )
        val freshProds = api.getSellerProducts(currentShop.id, sess.token)
        _uiState.value = _uiState.value.copy(sellerProducts = freshProds)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun saveSellerProduct(product: Product) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        val prodId = if (product.id.startsWith("prod_")) null else product.id
        api.saveSellerProduct(currentShop.id, prodId, product, sess.token)
        val freshProds = api.getSellerProducts(currentShop.id, sess.token)
        val allPublic = api.getPublicProducts()
        _uiState.value = _uiState.value.copy(
          sellerProducts = freshProds,
          products = allPublic
        )
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  fun setProductActive(product: Product, active: Boolean) {
    val currentShop = _uiState.value.myShop ?: return
    val sess = _uiState.value.session ?: return
    viewModelScope.launch {
      try {
        api.setProductActive(currentShop.id, product.id, active, sess.token)
        val freshProds = api.getSellerProducts(currentShop.id, sess.token)
        _uiState.value = _uiState.value.copy(sellerProducts = freshProds)
      } catch (e: Exception) {
        _uiState.value = _uiState.value.copy(errorMessage = api.cleanErrorMessage(e))
      }
    }
  }

  private fun triggerOrderVibration() {
    if (!_uiState.value.vibrationEnabled) return
    try {
      val ctx = getApplication<Application>()
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val manager = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        manager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 120, 300), -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(longArrayOf(0, 300, 120, 300), -1)
      }
    } catch (_: Exception) {}
  }
}
