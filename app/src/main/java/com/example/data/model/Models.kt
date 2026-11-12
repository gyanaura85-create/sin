package com.example.data.model

data class Shop(
  val id: String,
  val name: String,
  val ownerName: String? = null,
  val phone: String = "",
  val area: String = "",
  val category: String = "Grocery",
  val photoUrl: String? = null,
  val isOpen: Boolean = true,
  val rating: Double = 0.0,
  val ratingCount: Int = 0,
  val offer: String? = null,
  val upiId: String? = null,
  val qrUrl: String? = null
)

data class Product(
  val id: String,
  val shopId: String,
  val name: String,
  val category: String = "Other",
  val unit: String = "kg",
  val price: Double,
  val originalPrice: Double? = null,
  val onlineQty: Double = 0.0,
  val shopQty: Double = 0.0,
  val lowAlert: Double = 5.0,
  val description: String? = null,
  val imageUrl: String? = null,
  val active: Boolean = true,
  val stockVersion: Int? = null,
  val shopName: String? = null
)

data class OrderItem(
  val id: String,
  val orderId: String? = null,
  val productId: String,
  val name: String,
  val price: Double,
  val qty: Double,
  val unit: String
)

data class Order(
  val id: String,
  val orderNumber: Long? = null,
  val shopId: String,
  val userId: String? = null,
  val status: String = "new", // new, accepted, preparing, ready, on_the_way, delivered, cancelled
  val customerName: String = "",
  val customerPhone: String = "",
  val customerAddress: String = "",
  val deliveryType: String = "delivery", // "delivery" | "pickup"
  val paymentMethod: String = "cod", // "cod" | "upi"
  val total: Double = 0.0,
  val createdAt: String = "",
  val updatedAt: String = "",
  val cancelReason: String? = null,
  val orderItems: List<OrderItem> = emptyList(),
  val shopName: String? = null,
  val shopPhone: String? = null,
  val utrNumber: String? = null,
  val paymentStatus: String? = null // "pending_verification", "verified", "rejected"
) {
  val isPickup: Boolean get() = deliveryType.contains("pick", ignoreCase = true)
  val isUpi: Boolean get() = paymentMethod.contains("upi", ignoreCase = true)
}

data class UserSession(
  val token: String,
  val refresh: String,
  val uid: String,
  val email: String,
  val role: String = "buyer", // "buyer" | "seller"
  val expiresAt: Long = 0L
)

data class UserProfile(
  val name: String = "",
  val phone: String = "",
  val address: String = "",
  val area: String = "",
  val location: String = "",
  val role: String = "buyer"
)

data class UserLocation(
  val area: String = "Current location",
  val fullAddress: String = "",
  val lat: Double? = null,
  val lng: Double? = null
)

data class CartItem(
  val product: Product,
  val qty: Double
)

data class Cart(
  val shop: Shop,
  val items: Map<String, CartItem> = emptyMap()
) {
  val itemCount: Int get() = items.size
  val totalAmount: Double get() = items.values.sumOf { it.product.price * it.qty }
}

data class CategoryMeta(
  val key: String,
  val icon: String,
  val bgHex: String
)
