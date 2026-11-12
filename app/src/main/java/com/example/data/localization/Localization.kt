package com.example.data.localization

import com.example.data.model.CategoryMeta
import java.util.Locale

object Localization {
  const val EN = "en"
  const val HI = "hi"
  const val OR = "or"

  val SUPPORTED_LANGUAGES = listOf(
    EN to "English",
    HI to "हिन्दी",
    OR to "ଓଡ଼ିଆ"
  )

  val CATEGORIES = listOf(
    CategoryMeta("Grocery", "🧺", "#fff0d6"),
    CategoryMeta("Fashion", "👕", "#e3ecff"),
    CategoryMeta("Electronics", "💻", "#d9f6ff"),
    CategoryMeta("Home", "🛋️", "#e6e8ff"),
    CategoryMeta("Beauty", "💄", "#fde4ea"),
    CategoryMeta("Pharmacy", "💊", "#d9f8ec"),
    CategoryMeta("Food", "🍽️", "#fff3c4"),
    CategoryMeta("Sabzi-Phal", "🥬", "#e1f7e3"),
    CategoryMeta("Dudh-Dairy", "🥛", "#e8f1ff")
  )

  val PRODUCT_CATEGORIES = listOf(
    "Atta, Rice & Dal", "Oil & Ghee", "Masala", "Snacks", "Beverages",
    "Dairy", "Sabzi", "Phal", "Personal Care", "Home Care",
    "Mobile & Accessories", "Other"
  )

  val UNITS = listOf("kg", "litre", "piece", "pack")

  private val DICTIONARY = mapOf(
    "Home" to mapOf(HI to "होम", OR to "ହୋମ୍"),
    "Categories" to mapOf(HI to "श्रेणियाँ", OR to "ବର୍ଗ"),
    "Cart" to mapOf(HI to "कार्ट", OR to "କାର୍ଟ"),
    "Orders" to mapOf(HI to "ऑर्डर", OR to "ଅର୍ଡର"),
    "Profile" to mapOf(HI to "प्रोफ़ाइल", OR to "ପ୍ରୋଫାଇଲ୍"),
    "Dashboard" to mapOf(HI to "डैशबोर्ड", OR to "ଡ୍ୟାସବୋର୍ଡ"),
    "Products" to mapOf(HI to "प्रोडक्ट", OR to "ପ୍ରଡକ୍ଟ"),
    "More" to mapOf(HI to "और", OR to "ଅଧିକ"),
    "Add" to mapOf(HI to "जोड़ें", OR to "ଯୋଡ଼ନ୍ତୁ"),
    "Back" to mapOf(HI to "वापस", OR to "ପଛକୁ"),
    "Close" to mapOf(HI to "बंद करें", OR to "ବନ୍ଦ କରନ୍ତୁ"),
    "Language" to mapOf(HI to "भाषा", OR to "ଭାଷା"),
    "Save" to mapOf(HI to "सेव करें", OR to "ସେଭ୍ କରନ୍ତୁ"),
    "Login" to mapOf(HI to "लॉगिन", OR to "ଲଗ୍‌ଇନ୍"),
    "Log Out" to mapOf(HI to "लॉग आउट", OR to "ଲଗ୍ ଆଉଟ୍"),
    "Create a new account" to mapOf(HI to "नया अकाउंट बनाएँ", OR to "ନୂଆ ଆକାଉଣ୍ଟ ଖୋଲନ୍ତୁ"),
    "Create account" to mapOf(HI to "अकाउंट बनाएँ", OR to "ଆକାଉଣ୍ଟ ଖୋଲନ୍ତୁ"),
    "Already have an account? Log in" to mapOf(HI to "पहले से अकाउंट है? लॉगिन करें", OR to "ଆଗରୁ ଆକାଉଣ୍ଟ ଅଛି? ଲଗ୍‌ଇନ୍ କରନ୍ତୁ"),
    "Email" to mapOf(HI to "ईमेल", OR to "ଇମେଲ୍"),
    "Password (6+ characters)" to mapOf(HI to "पासवर्ड (6+ अक्षर)", OR to "ପାସୱାର୍ଡ (6+ ଅକ୍ଷର)"),
    "Please wait..." to mapOf(HI to "कृपया प्रतीक्षा करें...", OR to "ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ..."),
    "Enter a valid email and a password of 6+ characters" to mapOf(HI to "सही ईमेल और 6+ अक्षर का पासवर्ड डालें", OR to "ସଠିକ୍ ଇମେଲ୍ ଓ 6+ ଅକ୍ଷରର ପାସୱାର୍ଡ ଦିଅନ୍ତୁ"),
    "Account created. Please log in." to mapOf(HI to "अकाउंट बन गया। कृपया लॉगिन करें।", OR to "ଆକାଉଣ୍ଟ ଖୋଲାଗଲା। ଦୟାକରି ଲଗ୍‌ଇନ୍ କରନ୍ତୁ।"),
    "Email login is for testing. Phone OTP will come at launch." to mapOf(HI to "ईमेल लॉगिन सिर्फ़ टेस्ट के लिए है। लॉन्च पर फ़ोन OTP आएगा।", OR to "ଇମେଲ୍ ଲଗ୍‌ଇନ୍ କେବଳ ପରୀକ୍ଷା ପାଇଁ। ଲଞ୍ଚ ସମୟରେ ଫୋନ୍ OTP ଆସିବ।"),
    "Welcome to NearKart" to mapOf(HI to "NearKart में स्वागत है", OR to "NearKart କୁ ସ୍ୱାଗତ"),
    "Login or sign up to continue" to mapOf(HI to "आगे बढ़ने के लिए लॉगिन या साइन-अप करें", OR to "ଆଗକୁ ବଢ଼ିବାକୁ ଲଗ୍‌ଇନ୍ କିମ୍ବା ସାଇନ୍-ଅପ୍ କରନ୍ତୁ"),
    "Continue browsing" to mapOf(HI to "ब्राउज़ करते रहें", OR to "ବ୍ରାଉଜ୍ ଜାରି ରଖନ୍ତୁ"),
    "Hello," to mapOf(HI to "नमस्ते,", OR to "ନମସ୍କାର,"),
    "Shopper!" to mapOf(HI to "ग्राहक!", OR to "ଗ୍ରାହକ!"),
    "Delivering to" to mapOf(HI to "डिलीवरी:", OR to "ଡେଲିଭରି:"),
    "Select your location" to mapOf(HI to "अपनी लोकेशन चुनें", OR to "ଆପଣଙ୍କ ଲୋକେସନ୍ ବାଛନ୍ତୁ"),
    "Use my current location" to mapOf(HI to "मेरी मौजूदा लोकेशन इस्तेमाल करें", OR to "ମୋ ବର୍ତ୍ତମାନ ଲୋକେସନ୍ ବ୍ୟବହାର କରନ୍ତୁ"),
    "Delivery Location" to mapOf(HI to "डिलीवरी लोकेशन", OR to "ଡେଲିଭରି ଲୋକେସନ୍"),
    "Search products, shops, and categories" to mapOf(HI to "प्रोडक्ट, दुकान और श्रेणी खोजें", OR to "ପ୍ରଡକ୍ଟ, ଦୋକାନ ଓ ବର୍ଗ ଖୋଜନ୍ତୁ"),
    "Explore Categories" to mapOf(HI to "श्रेणियाँ देखें", OR to "ବର୍ଗ ଦେଖନ୍ତୁ"),
    "View All →" to mapOf(HI to "सभी देखें →", OR to "ସବୁ ଦେଖନ୍ତୁ →"),
    "View All" to mapOf(HI to "सभी देखें", OR to "ସବୁ ଦେଖନ୍ତୁ"),
    "Great deals" to mapOf(HI to "शानदार डील्स", OR to "ଭଲ ଡିଲ୍"),
    "near you" to mapOf(HI to "आपके पास", OR to "ଆପଣଙ୍କ ପାଖରେ"),
    "Discover offers from local shops" to mapOf(HI to "स्थानीय दुकानों के ऑफ़र देखें", OR to "ସ୍ଥାନୀୟ ଦୋକାନର ଅଫର୍ ଦେଖନ୍ତୁ"),
    "Shops Near You" to mapOf(HI to "आपके पास की दुकानें", OR to "ଆପଣଙ୍କ ପାଖ ଦୋକାନ"),
    "Popular Products" to mapOf(HI to "लोकप्रिय प्रोडक्ट", OR to "ଲୋକପ୍ରିୟ ପ୍ରଡକ୍ଟ"),
    "Open now" to mapOf(HI to "अभी खुला", OR to "ବର୍ତ୍ତମାନ ଖୋଲା"),
    "No shops have joined yet." to mapOf(HI to "अभी कोई दुकान नहीं जुड़ी है।", OR to "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଦୋକାନ ଯୋଡ଼ି ହୋଇନାହିଁ।"),
    "No results found." to mapOf(HI to "कोई नतीजा नहीं मिला।", OR to "କୌଣସି ଫଳାଫଳ ମିଳିଲା ନାହିଁ।"),
    "All Categories" to mapOf(HI to "सभी श्रेणियाँ", OR to "ସମସ୍ତ ବର୍ଗ"),
    "Grocery" to mapOf(HI to "किराना", OR to "ମୁଦିଖାନା"),
    "Fashion" to mapOf(HI to "फ़ैशन", OR to "ଫ୍ୟାସନ୍"),
    "Electronics" to mapOf(HI to "इलेक्ट्रॉनिक्स", OR to "ଇଲେକ୍ଟ୍ରୋନିକ୍ସ"),
    "Beauty" to mapOf(HI to "ब्यूटी", OR to "ବ୍ୟୁଟି"),
    "Pharmacy" to mapOf(HI to "फ़ार्मेसी", OR to "ଫାର୍ମାସି"),
    "Food" to mapOf(HI to "खाना", OR to "ଖାଦ୍ୟ"),
    "Sabzi-Phal" to mapOf(HI to "सब्ज़ी-फल", OR to "ପନିପରିବା ଓ ଫଳ"),
    "Dudh-Dairy" to mapOf(HI to "दूध-डेयरी", OR to "ଦୁଧ ଓ ଡେୟାରୀ"),
    "Atta, Rice & Dal" to mapOf(HI to "आटा, चावल और दाल", OR to "ଆଟା, ଚାଉଳ ଓ ଡାଲି"),
    "Oil & Ghee" to mapOf(HI to "तेल और घी", OR to "ତେଲ ଓ ଘିଅ"),
    "Masala" to mapOf(HI to "मसाले", OR to "ମସଲା"),
    "Snacks" to mapOf(HI to "नाश्ता", OR to "ସ୍ନାକ୍ସ"),
    "Beverages" to mapOf(HI to "पेय", OR to "ପାନୀୟ"),
    "Dairy" to mapOf(HI to "डेयरी", OR to "ଡେୟାରୀ"),
    "Sabzi" to mapOf(HI to "सब्ज़ी", OR to "ପନିପରିବା"),
    "Phal" to mapOf(HI to "फल", OR to "ଫଳ"),
    "Personal Care" to mapOf(HI to "पर्सनल केयर", OR to "ପର୍ସନାଲ୍ କେୟାର"),
    "Home Care" to mapOf(HI to "होम केयर", OR to "ହୋମ୍ କେୟାର"),
    "Mobile & Accessories" to mapOf(HI to "मोबाइल और एक्सेसरीज़", OR to "ମୋବାଇଲ୍ ଓ ଆକ୍ସେସୋରି"),
    "Other" to mapOf(HI to "अन्य", OR to "ଅନ୍ୟାନ୍ୟ"),
    "Search in this shop" to mapOf(HI to "इस दुकान में खोजें", OR to "ଏହି ଦୋକାନରେ ଖୋଜନ୍ତୁ"),
    "Price range (₹)" to mapOf(HI to "कीमत सीमा (₹)", OR to "ମୂଲ୍ୟ ସୀମା (₹)"),
    "Min" to mapOf(HI to "कम से कम", OR to "ସର୍ବନିମ୍ନ"),
    "Max" to mapOf(HI to "ज़्यादा से ज़्यादा", OR to "ସର୍ବାଧିକ"),
    "All" to mapOf(HI to "सभी", OR to "ସମସ୍ତ"),
    "No products found." to mapOf(HI to "कोई प्रोडक्ट नहीं मिला।", OR to "କୌଣସି ପ୍ରଡକ୍ଟ ମିଳିଲା ନାହିଁ।"),
    "Out of stock" to mapOf(HI to "स्टॉक खत्म", OR to "ଷ୍ଟକ୍ ସରିଛି"),
    "View Cart →" to mapOf(HI to "कार्ट देखें →", OR to "କାର୍ଟ ଦେଖନ୍ତୁ →"),
    "● Open" to mapOf(HI to "● खुला", OR to "● ଖୋଲା"),
    "● Closed" to mapOf(HI to "● बंद", OR to "● ବନ୍ଦ"),
    "New" to mapOf(HI to "नया", OR to "ନୂଆ"),
    "How much do you need?" to mapOf(HI to "कितना चाहिए?", OR to "କେତେ ଦରକାର?"),
    "Or type your own amount" to mapOf(HI to "या अपनी मात्रा लिखें", OR to "କିମ୍ବା ନିଜେ ପରିମାଣ ଲେଖନ୍ତୁ"),
    "Not enough stock" to mapOf(HI to "इतना स्टॉक नहीं है", OR to "ଏତେ ଷ୍ଟକ୍ ନାହିଁ"),
    "In stock" to mapOf(HI to "स्टॉक में है", OR to "ଷ୍ଟକ୍‌ରେ ଅଛି"),
    "The shop is closed right now." to mapOf(HI to "दुकान अभी बंद है।", OR to "ଦୋକାନ ବର୍ତ୍ତମାନ ବନ୍ଦ ଅଛି।"),
    "Your cart is empty." to mapOf(HI to "आपका कार्ट खाली है।", OR to "ଆପଣଙ୍କ କାର୍ଟ ଖାଲି ଅଛି।"),
    "Open a shop and add products." to mapOf(HI to "कोई दुकान खोलकर प्रोडक्ट जोड़ें।", OR to "କୌଣସି ଦୋକାନ ଖୋଲି ପ୍ରଡକ୍ଟ ଯୋଡ଼ନ୍ତୁ।"),
    "Remove" to mapOf(HI to "हटाएँ", OR to "ହଟାନ୍ତୁ"),
    "Total" to mapOf(HI to "कुल", OR to "ମୋଟ"),
    "Delivery: agree with the shop (free for now)" to mapOf(HI to "डिलीवरी: दुकान से तय करें (अभी मुफ़्त)", OR to "ଡେଲିଭରି: ଦୋକାନ ସହ ଠିକ୍ କରନ୍ତୁ (ବର୍ତ୍ତମାନ ମାଗଣା)"),
    "Delivery details" to mapOf(HI to "डिलीवरी की जानकारी", OR to "ଡେଲିଭରି ବିବରଣୀ"),
    "Your name" to mapOf(HI to "आपका नाम", OR to "ଆପଣଙ୍କ ନାମ"),
    "Phone (10 digits)" to mapOf(HI to "फ़ोन (10 अंक)", OR to "ଫୋନ୍ (10 ଅଙ୍କ)"),
    "Full address" to mapOf(HI to "पूरा पता", OR to "ପୂର୍ଣ୍ଣ ଠିକଣା"),
    "Full address (optional for pickup)" to mapOf(HI to "पूरा पता (पिकअप के लिए वैकल्पिक)", OR to "ପୂର୍ଣ୍ଣ ଠିକଣା (ପିକଅପ୍ ପାଇଁ ଇଚ୍ଛାଧୀନ)"),
    "Payment" to mapOf(HI to "भुगतान", OR to "ପେମେଣ୍ଟ"),
    "Cash on Delivery" to mapOf(HI to "कैश ऑन डिलीवरी", OR to "କ୍ୟାସ୍ ଅନ୍ ଡେଲିଭରି"),
    "Selected" to mapOf(HI to "चुना हुआ", OR to "ବଛାଯାଇଛି"),
    "UPI" to mapOf(HI to "UPI", OR to "UPI"),
    "Pay with UPI" to mapOf(HI to "UPI से भुगतान करें", OR to "UPI ରେ ପେମେଣ୍ଟ କରନ୍ତୁ"),
    "Open UPI app" to mapOf(HI to "UPI ऐप खोलें", OR to "UPI ଆପ୍ ଖୋଲନ୍ତୁ"),
    "UPI payment is confirmed only after the shop verifies it." to mapOf(HI to "UPI भुगतान तभी पक्का होगा जब दुकान उसे जाँच ले।", OR to "UPI ପେମେଣ୍ଟ ଦୋକାନ ଯାଞ୍ଚ କଲା ପରେ ହିଁ ନିଶ୍ଚିତ ହେବ।"),
    "UTR Number" to mapOf(HI to "UTR नंबर", OR to "UTR ନମ୍ବର"),
    "Payment verified" to mapOf(HI to "भुगतान सत्यापित", OR to "ପେମେଣ୍ଟ ଯାଞ୍ଚ ହୋଇଛି"),
    "Order placed" to mapOf(HI to "ऑर्डर", OR to "ଅର୍ଡର"),
    "successfully!" to mapOf(HI to "सफलतापूर्वक हो गया!", OR to "ସଫଳତାର ସହ ହୋଇଗଲା!"),
    "will confirm within 10 minutes" to mapOf(HI to "10 मिनट में कन्फ़र्म करेगी", OR to "10 ମିନିଟ୍ ମଧ୍ୟରେ ନିଶ୍ଚିତ କରିବେ"),
    "View my orders" to mapOf(HI to "मेरे ऑर्डर देखें", OR to "ମୋ ଅର୍ଡର ଦେଖନ୍ତୁ"),
    "Go to Home" to mapOf(HI to "होम पर जाएँ", OR to "ହୋମ୍‌କୁ ଯାଆନ୍ତୁ"),
    "My Orders" to mapOf(HI to "मेरे ऑर्डर", OR to "ମୋ ଅର୍ଡର"),
    "Track live orders and view past purchases" to mapOf(HI to "लाइव ऑर्डर ट्रैक करें और पुरानी खरीदारी देखें", OR to "ଲାଇଭ୍ ଅର୍ଡର ଟ୍ରାକ୍ କରନ୍ତୁ ଓ ପୁରୁଣା କିଣାକିଣି ଦେଖନ୍ତୁ"),
    "No orders yet." to mapOf(HI to "अभी कोई ऑर्डर नहीं।", OR to "ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଅର୍ଡର ନାହିଁ।"),
    "Cancel order" to mapOf(HI to "ऑर्डर रद्द करें", OR to "ଅର୍ଡର ବାତିଲ୍ କରନ୍ତୁ"),
    "Accepted" to mapOf(HI to "स्वीकार किया", OR to "ଗ୍ରହଣ ହୋଇଛି"),
    "Out for delivery" to mapOf(HI to "डिलीवरी के लिए निकला", OR to "ଡେଲିଭରି ପାଇଁ ବାହାରିଛି"),
    "Delivered" to mapOf(HI to "पहुँच गया", OR to "ପହଞ୍ଚିଗଲା"),
    "Cancelled" to mapOf(HI to "रद्द", OR to "ବାତିଲ୍"),
    "Preparing" to mapOf(HI to "तैयार हो रहा है", OR to "ପ୍ରସ୍ତୁତ ହେଉଛି"),
    "Ready" to mapOf(HI to "तैयार", OR to "ପ୍ରସ୍ତୁତ"),
    "Estimated Delivery" to mapOf(HI to "अनुमानित डिलीवरी", OR to "ଅନୁମାନିତ ଡେଲିଭରି"),
    "Order Status" to mapOf(HI to "ऑर्डर की स्थिति", OR to "ଅର୍ଡର ସ୍ଥିତି"),
    "Delivery Information" to mapOf(HI to "डिलीवरी की जानकारी", OR to "ଡେଲିଭରି ସୂଚନା"),
    "Home Delivery" to mapOf(HI to "होम डिलीवरी", OR to "ହୋମ୍ ଡେଲିଭରି"),
    "Pickup" to mapOf(HI to "पिकअप", OR to "ପିକଅପ୍"),
    "Pickup from shop" to mapOf(HI to "दुकान से पिकअप", OR to "ଦୋକାନରୁ ପିକଅପ୍"),
    "View on Map" to mapOf(HI to "मैप पर देखें", OR to "ମ୍ୟାପ୍‌ରେ ଦେଖନ୍ତୁ"),
    "Order Summary" to mapOf(HI to "ऑर्डर सारांश", OR to "ଅର୍ଡର ସାରାଂଶ"),
    "Items" to mapOf(HI to "आइटम", OR to "ଆଇଟମ୍"),
    "Subtotal" to mapOf(HI to "उप-कुल", OR to "ଉପମୋଟ"),
    "Delivery Charge" to mapOf(HI to "डिलीवरी शुल्क", OR to "ଡେଲିଭରି ଚାର୍ଜ"),
    "Free" to mapOf(HI to "मुफ़्त", OR to "ମାଗଣା"),
    "Total Amount" to mapOf(HI to "कुल रकम", OR to "ମୋଟ ରାଶି"),
    "View Details" to mapOf(HI to "विवरण देखें", OR to "ବିବରଣୀ ଦେଖନ୍ତୁ"),
    "Need Help?" to mapOf(HI to "मदद चाहिए?", OR to "ସାହାଯ୍ୟ ଦରକାର?"),
    "Chat with us or call the store" to mapOf(HI to "हमसे चैट करें या दुकान को कॉल करें", OR to "ଆମ ସହ ଚାଟ୍ କରନ୍ତୁ କିମ୍ବା ଦୋକାନକୁ କଲ୍ କରନ୍ତୁ"),
    "Reorder" to mapOf(HI to "दोबारा ऑर्डर करें", OR to "ପୁନଃ ଅର୍ଡର କରନ୍ତୁ"),
    "Call" to mapOf(HI to "कॉल", OR to "କଲ୍"),
    "Order Details" to mapOf(HI to "ऑर्डर विवरण", OR to "ଅର୍ଡର ବିବରଣୀ"),
    "View Bill / Invoice" to mapOf(HI to "बिल / इनवॉइस देखें", OR to "ବିଲ୍ / ଇନଭଏସ୍ ଦେଖନ୍ତୁ"),
    "Update Order Status" to mapOf(HI to "ऑर्डर स्थिति अपडेट करें", OR to "ଅର୍ଡର ସ୍ଥିତି ଅପଡେଟ୍ କରନ୍ତୁ"),
    "Accept Order" to mapOf(HI to "ऑर्डर स्वीकार करें", OR to "ଅର୍ଡର ଗ୍ରହଣ କରନ୍ତୁ"),
    "Reject Order" to mapOf(HI to "ऑर्डर अस्वीकार करें", OR to "ଅର୍ଡର ପ୍ରତ୍ୟାଖ୍ୟାନ"),
    "Start Preparing" to mapOf(HI to "तैयारी शुरू करें", OR to "ପ୍ରସ୍ତୁତି ଆରମ୍ଭ"),
    "Mark as Ready" to mapOf(HI to "तैयार चिह्नित करें", OR to "ପ୍ରସ୍ତୁତ ବୋଲି ଚିହ୍ନିତ"),
    "Mark as Delivered" to mapOf(HI to "डिलीवर चिह्नित करें", OR to "ଡେଲିଭର୍ ବୋଲି ଚିହ୍ନିତ"),
    "Saved Addresses" to mapOf(HI to "सेव किए पते", OR to "ସେଭ୍ ଠିକଣା"),
    "Customer Support" to mapOf(HI to "कस्टमर सपोर्ट", OR to "ଗ୍ରାହକ ସହାୟତା"),
    "Establish Your Local Business Presence" to mapOf(HI to "अपने लोकल बिज़नेस की पहचान बनाएँ", OR to "ଆପଣଙ୍କ ସ୍ଥାନୀୟ ବ୍ୟବସାୟର ପରିଚୟ ତିଆରି କରନ୍ତୁ"),
    "Create your unique shop profile and connect directly with local customers. A simple process to list your products and take orders." to mapOf(
      HI to "अपनी दुकान की अनोखी प्रोफ़ाइल बनाएँ और सीधे स्थानीय ग्राहकों से जुड़ें। प्रोडक्ट लिस्ट करने और ऑर्डर लेने की आसान प्रक्रिया।",
      OR to "ଆପଣଙ୍କ ଦୋକାନର ନିଜସ୍ୱ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ ଏବଂ ସିଧାସଳଖ ସ୍ଥାନୀୟ ଗ୍ରାହକଙ୍କ ସହ ଯୋଡ଼ିହୁଅନ୍ତୁ। ପ୍ରଡକ୍ଟ ତାଲିକାଭୁକ୍ତ କରିବା ଓ ଅର୍ଡର ନେବା ପାଇଁ ସହଜ ପ୍ରକ୍ରିୟା।"
    ),
    "Create a Shop Profile" to mapOf(HI to "दुकान प्रोफ़ाइल बनाएँ", OR to "ଦୋକାନ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ"),
    "Register your shop" to mapOf(HI to "अपनी दुकान जोड़ें", OR to "ଆପଣଙ୍କ ଦୋକାନ ଯୋଡ଼ନ୍ତୁ"),
    "Shop name" to mapOf(HI to "दुकान का नाम", OR to "ଦୋକାନର ନାମ"),
    "Owner name" to mapOf(HI to "मालिक का नाम", OR to "ମାଲିକଙ୍କ ନାମ"),
    "Phone number" to mapOf(HI to "फ़ोन नंबर", OR to "ଫୋନ୍ ନମ୍ବର"),
    "Village / Area" to mapOf(HI to "गाँव / क्षेत्र", OR to "ଗାଁ / ଅଞ୍ଚଳ"),
    "Open my shop" to mapOf(HI to "मेरी दुकान खोलें", OR to "ମୋ ଦୋକାନ ଖୋଲନ୍ତୁ"),
    "Today's Summary" to mapOf(HI to "आज का सारांश", OR to "ଆଜିର ସାରାଂଶ"),
    "New Orders" to mapOf(HI to "नए ऑर्डर", OR to "ନୂଆ ଅର୍ଡର"),
    "Total Orders" to mapOf(HI to "कुल ऑर्डर", OR to "ମୋଟ ଅର୍ଡର"),
    "Total Sales" to mapOf(HI to "कुल बिक्री", OR to "ମୋଟ ବିକ୍ରି"),
    "Shop Rating" to mapOf(HI to "दुकान रेटिंग", OR to "ଦୋକାନ ରେଟିଂ"),
    "Live Shop Advertisement" to mapOf(HI to "लाइव दुकान विज्ञापन", OR to "ଲାଇଭ୍ ଦୋକାନ ବିଜ୍ଞାପନ"),
    "Published" to mapOf(HI to "प्रकाशित", OR to "ପ୍ରକାଶିତ"),
    "Empty" to mapOf(HI to "खाली", OR to "ଖାଲି"),
    "Publish" to mapOf(HI to "प्रकाशित करें", OR to "ପ୍ରକାଶ କରନ୍ତୁ"),
    "Stock alert" to mapOf(HI to "स्टॉक अलर्ट", OR to "ଷ୍ଟକ୍ ଆଲର୍ଟ"),
    "Recent Customer Orders" to mapOf(HI to "हाल के ग्राहक ऑर्डर", OR to "ସମ୍ପ୍ରତି ଗ୍ରାହକ ଅର୍ଡର"),
    "Seller Orders" to mapOf(HI to "सेलर ऑर्डर", OR to "ସେଲର୍ ଅର୍ଡର"),
    "Accept" to mapOf(HI to "स्वीकार करें", OR to "ଗ୍ରହଣ କରନ୍ତୁ"),
    "Reject" to mapOf(HI to "अस्वीकार करें", OR to "ପ୍ରତ୍ୟାଖ୍ୟାନ"),
    "All Products" to mapOf(HI to "सभी प्रोडक्ट", OR to "ସମସ୍ତ ପ୍ରଡକ୍ଟ"),
    "+ Add Product" to mapOf(HI to "+ प्रोडक्ट जोड़ें", OR to "+ ପ୍ରଡକ୍ଟ ଯୋଡ଼ନ୍ତୁ"),
    "Payment Account" to mapOf(HI to "पेमेंट अकाउंट", OR to "ପେମେଣ୍ଟ ଆକାଉଣ୍ଟ"),
    "Shop Management" to mapOf(HI to "दुकान प्रबंधन", OR to "ଦୋକାନ ପରିଚାଳନା"),
    "Products & Sales" to mapOf(HI to "प्रोडक्ट और बिक्री", OR to "ପ୍ରଡକ୍ଟ ଓ ବିକ୍ରି"),
    "Support & Account" to mapOf(HI to "सपोर्ट और अकाउंट", OR to "ସହାୟତା ଓ ଆକାଉଣ୍ଟ"),
    "Notification" to mapOf(HI to "नोटिफ़िकेशन", OR to "ନୋଟିଫିକେସନ୍"),
    "Your neighbourhood, your marketplace." to mapOf(HI to "आपका मोहल्ला, आपका बाज़ार।", OR to "ଆପଣଙ୍କ ପଡ଼ା, ଆପଣଙ୍କ ବଜାର।"),
    "Loading..." to mapOf(HI to "लोड हो रहा है...", OR to "ଲୋଡ୍ ହେଉଛି...")
  )

  val ALIASES: List<List<String>> = listOf(
    listOf("onion", "piyaj", "piaj", "pyaz", "pyaaz", "pyaj", "pyaja", "kanda", "प्याज", "पियाज", "ପିଆଜ"),
    listOf("potato", "aloo", "alu", "aaloo", "batata", "आलू", "ଆଳୁ"),
    listOf("tomato", "tamatar", "tomatar", "tamata", "टमाटर", "ଟମାଟୋ", "ଟମାଟର"),
    listOf("milk", "dudh", "doodh", "dood", "दूध", "ଦୁଧ"),
    listOf("rice", "chawal", "chaul", "chaula", "चावल", "ଚାଉଳ"),
    listOf("atta", "aata", "wheat flour", "gehu", "gehun", "आटा", "गेहूं", "ଆଟା"),
    listOf("dal", "daal", "dhal", "lentil", "dali", "दाल", "ଡାଲି"),
    listOf("oil", "tel", "tail", "तेल", "ତେଲ"),
    listOf("ghee", "ghi", "घी", "ଘିଅ"),
    listOf("sugar", "chini", "cheeni", "shakkar", "चीनी", "शक्कर", "ଚିନି"),
    listOf("salt", "namak", "nun", "नमक", "ଲୁଣ"),
    listOf("banana", "kela", "kadali", "केला", "କଦଳୀ"),
    listOf("apple", "seb", "seu", "सेब", "ସେଉ"),
    listOf("mango", "aam", "amba", "आम", "ଆମ୍ବ"),
    listOf("egg", "anda", "ande", "अंडा", "ଅଣ୍ଡା"),
    listOf("bread", "pav", "ब्रेड", "पाव"),
    listOf("paneer", "cottage cheese", "पनीर", "ପନୀର"),
    listOf("curd", "dahi", "dahee", "yogurt", "दही", "ଦହି"),
    listOf("tea", "chai", "chay", "चाय", "ଚା"),
    listOf("soap", "sabun", "sabon", "साबुन", "ସାବୁନ"),
    listOf("chilli", "mirch", "mirchi", "lanka", "मिर्च", "ଲଙ୍କା"),
    listOf("garlic", "lahsun", "lasun", "rasun", "लहसुन", "ରସୁଣ"),
    listOf("ginger", "adrak", "ada", "अदरक", "ଅଦା"),
    listOf("cauliflower", "phulkopi", "phoolgobhi", "gobi", "फूलगोभी", "ଫୁଲକୋବି"),
    listOf("cabbage", "patta gobi", "bandhakopi", "पत्तागोभी", "ବନ୍ଧାକୋବି"),
    listOf("brinjal", "baingan", "begun", "eggplant", "बैंगन", "ବାଇଗଣ"),
    listOf("okra", "bhindi", "ladyfinger", "भिंडी", "ଭେଣ୍ଡି"),
    listOf("peas", "matar", "मटर", "ମଟର"),
    listOf("lemon", "nimbu", "nibu", "नींबू", "ଲେମ୍ବୁ"),
    listOf("coriander", "dhania", "dhaniya", "धनिया", "ଧନିଆ"),
    listOf("biscuit", "biskut", "biscuits", "बिस्किट"),
    listOf("vegetables", "sabzi", "sabji", "sabzee", "सब्ज़ी", "सब्जी", "ପନିପରିବା"),
    listOf("fruits", "phal", "fal", "फल", "ଫଳ"),
    listOf("grocery", "kirana", "किराना", "ମୁଦିଖାନା"),
    listOf("medicine", "dawai", "dawa", "दवा", "ଔଷଧ")
  )

  fun tr(text: String, lang: String = EN): String {
    if (lang == EN) return text
    val direct = DICTIONARY[text]?.get(lang)
    if (direct != null) return direct

    // Trim check
    val trimmed = text.trim()
    val match = DICTIONARY[trimmed]?.get(lang)
    if (match != null) {
      val leading = text.takeWhile { it.isWhitespace() }
      val trailing = text.takeLastWhile { it.isWhitespace() }
      return "$leading$match$trailing"
    }

    return text
  }

  fun getTermsFor(token: String): List<String> {
    val ql = token.trim().lowercase(Locale.ROOT)
    if (ql.isEmpty()) return emptyList()
    val terms = mutableSetOf(ql)
    for (group in ALIASES) {
      val matches = group.any { a ->
        a == ql || (ql.length >= 3 && a.startsWith(ql))
      }
      if (matches) {
        terms.addAll(group)
      }
    }
    return terms.toList()
  }

  fun matchText(targetText: String, query: String): Boolean {
    val t = targetText.lowercase(Locale.ROOT)
    val tokens = query.lowercase(Locale.ROOT).split("\\s+".toRegex()).filter { it.isNotBlank() }
    if (tokens.isEmpty()) return true
    return tokens.all { token ->
      val terms = getTermsFor(token)
      terms.any { term -> t.contains(term) }
    }
  }

  fun formatMoney(amount: Double): String {
    val rounded = Math.round(amount * 100.0) / 100.0
    return if (rounded % 1.0 == 0.0) {
      "₹${rounded.toLong()}"
    } else {
      String.format(Locale.ROOT, "₹%.2f", rounded)
    }
  }

  fun formatQty(qty: Double, unit: String): String {
    val u = unit.lowercase(Locale.ROOT)
    return when (u) {
      "kg" -> if (qty < 1.0) "${Math.round(qty * 1000)} g" else "${formatNum(qty)} kg"
      "litre" -> if (qty < 1.0) "${Math.round(qty * 1000)} ml" else "${formatNum(qty)} L"
      "pack" -> "${formatNum(qty)} pack"
      else -> "${formatNum(qty)} pc"
    }
  }

  fun formatNum(n: Double): String {
    return if (n % 1.0 == 0.0) n.toLong().toString() else String.format(Locale.ROOT, "%.2f", n).trimEnd('0').trimEnd('.')
  }
}
