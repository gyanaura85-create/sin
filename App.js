/*
 * NearKart — "Your neighbourhood, your marketplace."
 * Single-file Expo / React Native app (Supabase backend, RPC based, RLS safe)
 *
 * INSTALL (once):
 *   npx expo install @react-native-async-storage/async-storage expo-location expo-image-picker
 *   (expo-image-picker is only needed for "Upload QR image". Without it the seller can paste a QR photo link.)
 *
 * FLOW
 *  - App opens with the NearKart SPLASH screen (default English, language from Profile -> Language)
 *  - Everybody sees the same Home (guest can browse shops, products, add to cart)
 *  - BUYER: Profile / Orders / Place order -> Login or Sign up (buyer account).
 *      Profile page = same design for guest and buyer.
 *      A logged-in buyer does NOT see the "Local Business" card.
 *  - SELLER: only a guest sees the gradient card "Establish Your Local Business Presence".
 *      Tap "Create a Shop Profile" -> seller Login / Sign up -> shop registration -> Partner Hub.
 *      Seller account opens ONLY the Partner Hub. Seller logout -> back to guest Home.
 *  - Buyer: Home, Categories, Cart, Orders (live tracking), Profile
 *  - Seller: Dashboard, Orders (details + status update), Add, Products (table), More (profile)
 *
 * SELLER REGISTRATION / LOGIN (fixed in this version)
 *  - Signup uses /auth/v1/signup with data { role: 'seller' } (only a hint for onboarding, never used as authorization).
 *  - If email confirmation is ON, the app says so clearly and does NOT pretend the user is logged in.
 *  - The seller row in "profiles" (id = auth user id, role = seller) is written AFTER a real session exists,
 *    when the shop is registered (or right after the first seller login if it is missing).
 *  - The role that decides Buyer app / Partner Hub is ALWAYS read from the database (profiles.role),
 *    never from user_metadata. A buyer is never changed into a seller and a seller is never changed into a buyer.
 *  - update_my_profile (which writes role 'buyer') is NEVER called for a seller account.
 *  - Shop creation: get_my_shop is checked first (no duplicate shop), then register_my_shop is called.
 *
 * OPTIONAL SQL (recommended, safe, not destructive) - run ONCE in the Supabase SQL editor:
 *   It adds ONE new function "ensure_seller_profile". Without it the app falls back to a REST upsert on
 *   "profiles" (works only if your profiles RLS policy lets a user write his own row).
 *
 * create or replace function public.ensure_seller_profile(
 *   p_name text, p_phone text, p_area text default null, p_address text default null)
 * returns json language plpgsql security definer set search_path = public as $$
 * declare v_uid uuid := auth.uid(); v_role text;
 * begin
 *   if v_uid is null then raise exception 'Not authenticated'; end if;
 *   select role into v_role from public.profiles where id = v_uid;
 *   if v_role = 'buyer' and exists (select 1 from public.orders where user_id = v_uid) then
 *     raise exception 'This is a buyer account and cannot become a seller';
 *   end if;
 *   insert into public.profiles (id, name, phone, area, address, role, updated_at)
 *   values (v_uid, coalesce(nullif(trim(p_name), ''), 'Seller'), nullif(trim(p_phone), ''),
 *           nullif(trim(p_area), ''), nullif(trim(p_address), ''), 'seller', now())
 *   on conflict (id) do update set
 *     name = coalesce(nullif(trim(p_name), ''), public.profiles.name),
 *     phone = coalesce(nullif(trim(p_phone), ''), public.profiles.phone),
 *     area = coalesce(nullif(trim(p_area), ''), public.profiles.area),
 *     address = coalesce(nullif(trim(p_address), ''), public.profiles.address),
 *     role = 'seller', updated_at = now();
 *   return json_build_object('id', v_uid, 'role', 'seller');
 * end; $$;
 * grant execute on function public.ensure_seller_profile(text, text, text, text) to authenticated;
 *
 * UPI PAYMENT FLOW
 *  - Seller: More -> Payment Account -> UPI ID + QR code (upload image or paste link)
 *  - Buyer : Checkout -> UPI -> sees the shop QR code + UPI ID -> pays -> enters the 12 digit UTR number
 *            (a UPI order cannot be placed without a valid UTR number)
 *  - Seller: Order details -> sees the UTR number -> "Payment verified" / "Not received"
 *
 * SHOPS TABLE: the app never reads or writes the "shops" table directly (no table grant needed).
 *   get_public_shops, get_my_shop, register_my_shop, update_my_shop
 *
 * DATABASE RULES USED BY THIS APP (no direct REST writes to orders / order_items / products)
 *   place_order, get_my_orders_paginated, get_shop_orders_paginated, set_order_status,
 *   seller_get_products, seller_save_product, seller_set_product_active,
 *   update_shop_product_stock (optimistic version), update_my_profile (buyers only)
 *   payment: get_shop_payment, update_my_payment, submit_order_utr, get_order_payment, verify_order_payment
 *
 * ORDER STATUS  (UI key -> database value)
 *   new -> new, accepted -> accepted, preparing -> preparing,
 *   on_the_way -> out_for_delivery, ready -> ready_for_pickup, delivered -> delivered, cancelled -> cancelled
 *
 * ======================================================================
 * SUPABASE SQL FOR THE PAYMENT FEATURE  (run ONCE in the Supabase SQL editor, only if not done already)
 * Change the column names owner_id (shops) and user_id (orders) if your tables use other names.
 * ======================================================================
 *
 * alter table shops  add column if not exists upi_id text;
 * alter table shops  add column if not exists qr_url text;
 * alter table orders add column if not exists utr_number text;
 * alter table orders add column if not exists payment_status text;
 * create unique index if not exists orders_utr_unique on orders (utr_number) where utr_number is not null;
 *
 * create or replace function get_shop_payment(p_shop_id uuid) returns json
 * language sql security definer set search_path = public as $$
 *   select json_build_object('upi_id', s.upi_id, 'qr_url', s.qr_url) from shops s where s.id = p_shop_id;
 * $$;
 *
 * create or replace function update_my_payment(p_shop_id uuid, p_upi_id text, p_qr_url text) returns json
 * language plpgsql security definer set search_path = public as $$
 * begin
 *   update shops set upi_id = nullif(trim(p_upi_id), ''), qr_url = nullif(trim(p_qr_url), '')
 *   where id = p_shop_id and owner_id = auth.uid();
 *   if not found then raise exception 'You are not allowed to change this shop'; end if;
 *   return json_build_object('upi_id', p_upi_id, 'qr_url', p_qr_url);
 * end; $$;
 *
 * create or replace function submit_order_utr(p_order uuid, p_utr text) returns json
 * language plpgsql security definer set search_path = public as $$
 * begin
 *   if p_utr is null or p_utr !~ '^[0-9]{12}$' then raise exception 'UTR must be 12 digits'; end if;
 *   update orders set utr_number = p_utr, payment_status = 'pending_verification'
 *   where id = p_order and user_id = auth.uid() and payment_method ilike '%upi%';
 *   if not found then raise exception 'Order not found'; end if;
 *   return json_build_object('utr_number', p_utr, 'payment_status', 'pending_verification');
 * end; $$;
 *
 * create or replace function get_order_payment(p_order uuid) returns json
 * language sql security definer set search_path = public as $$
 *   select json_build_object('utr_number', o.utr_number, 'payment_status', o.payment_status)
 *   from orders o
 *   where o.id = p_order and (o.user_id = auth.uid()
 *     or exists (select 1 from shops s where s.id = o.shop_id and s.owner_id = auth.uid()));
 * $$;
 *
 * create or replace function verify_order_payment(p_order uuid, p_verified boolean) returns json
 * language plpgsql security definer set search_path = public as $$
 * begin
 *   update orders o set payment_status = case when p_verified then 'verified' else 'rejected' end
 *   where o.id = p_order and o.utr_number is not null
 *     and exists (select 1 from shops s where s.id = o.shop_id and s.owner_id = auth.uid());
 *   if not found then raise exception 'Order not found or no UTR submitted'; end if;
 *   return json_build_object('payment_status', case when p_verified then 'verified' else 'rejected' end);
 * end; $$;
 *
 * grant execute on function get_shop_payment(uuid) to anon, authenticated;
 * grant execute on function update_my_payment(uuid, text, text) to authenticated;
 * grant execute on function submit_order_utr(uuid, text) to authenticated;
 * grant execute on function get_order_payment(uuid) to authenticated;
 * grant execute on function verify_order_payment(uuid, boolean) to authenticated;
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text as RNText, TextInput as RNTextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, StatusBar, RefreshControl, Modal, Alert, Vibration, Image,
  Linking, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';

// ======================================================================
// CONFIG  (only the project URL and the public publishable key - never a service-role key)
// ======================================================================
const URL_ = 'https://mfdiicegsgbcbvyeuxgi.supabase.co';
const KEY = 'sb_publishable_I_ypFDUGPQdtct0U5FMhAQ_02rIepBx';
const SPLASH_MS = 2600; // splash screen time (milliseconds)
const PAGE = 20;        // buyer orders page size
const SPAGE = 20;       // seller orders page size

const BLUE = '#0b4fc2', DARK = '#0a3a99', INK = '#0b1f4d', MUTE = '#5b6a86';
const BG = '#f6f8fc', LINE = '#dbe3f3', GREEN = '#067a4e', RED = '#c81e4a', LIME = '#6fdc7d', ORANGE = '#d9730d';

const CATS = [
  { k: 'Grocery', ic: '🧺', bg: '#fff0d6' },
  { k: 'Fashion', ic: '👕', bg: '#e3ecff' },
  { k: 'Electronics', ic: '💻', bg: '#d9f6ff' },
  { k: 'Home', ic: '🛋️', bg: '#e6e8ff' },
  { k: 'Beauty', ic: '💄', bg: '#fde4ea' },
  { k: 'CHICKEN-FISH', ic: '🐟 🐔', bg: '#d9f8ec' },
  { k: 'Food', ic: '🍽️', bg: '#fff3c4' },
  { k: 'Sabzi-Phal', ic: '🥬', bg: '#e1f7e3' },
  { k: 'Dudh-Dairy', ic: '🥛', bg: '#e8f1ff' },
];
const SHOP_CATS = CATS.map((c) => c.k);
const PROD_CATS = ['Atta, Rice & Dal', 'Oil & Ghee', 'Masala', 'Snacks', 'Beverages', 'Dairy', 'Sabzi',
  'Phal', 'Personal Care', 'Home Care', 'Mobile & Accessories', 'Other'];
const UNITS = ['kg', 'litre', 'piece', 'pack'];

// ---------- order status: UI keys <-> database values ----------
const DB2UI = { out_for_delivery: 'on_the_way', ready_for_pickup: 'ready' };
const UI2DB = { on_the_way: 'out_for_delivery', ready: 'ready_for_pickup' };
const stUI = (x) => DB2UI[x] || x;
const stDB = (x) => UI2DB[x] || x;
const FLOW_D = ['new', 'accepted', 'preparing', 'on_the_way', 'delivered'];
const FLOW_P = ['new', 'accepted', 'preparing', 'ready', 'delivered'];
const flowOf = (o) => (o && o.pickup ? FLOW_P : FLOW_D);
const ALL_ST = ['new', 'accepted', 'preparing', 'on_the_way', 'ready', 'delivered', 'cancelled'];
const STATUS = { new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  on_the_way: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled' };
const SHORT = { new: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  on_the_way: 'Out for Delivery', delivered: 'Delivered' };
const STEPS = {
  new: ['Order Placed', 'Your order has been placed'],
  accepted: ['Order Accepted', 'The shop accepted your order'],
  preparing: ['Preparing', 'Seller is preparing your order'],
  ready: ['Ready', 'Your order will be ready soon'],
  on_the_way: ['Out for Delivery', 'Your order is on the way'],
  delivered: ['Delivered', 'Your order will be delivered'],
};

// ======================================================================
// OPTIONAL NATIVE MODULES
// ======================================================================
let AS = null;
try { AS = require('@react-native-async-storage/async-storage'); AS = AS.default || AS; } catch (e) { AS = null; }
let Loc = null;
try { Loc = require('expo-location'); } catch (e) { Loc = null; }
let Pick = null;
try { Pick = require('expo-image-picker'); } catch (e) { Pick = null; }
let ExLink = null;
try { ExLink = require('expo-linking'); } catch (e) { ExLink = null; }

let Cry = null;
try { Cry = require('expo-crypto'); } catch (e) { Cry = null; }
let Notif = null;
try { Notif = require('expo-notifications'); } catch (e) { Notif = null; }

let Dev = null;
try { Dev = require('expo-device'); } catch (e) { Dev = null; }
const store = {
  get: async (k) => { try { return AS ? await AS.getItem(k) : null; } catch (e) { return null; } },
  set: async (k, v) => { try { if (AS) await AS.setItem(k, v); } catch (e) {} },
  del: async (k) => { try { if (AS) await AS.removeItem(k); } catch (e) {} },
};
const PREF = { vib: true };

// Accurate current location: high-accuracy GPS + best reverse-geocode match
async function detectArea() {
  if (!Loc) throw new Error('Location is not available. Install expo-location.');
  let on = true;
  try { on = await Loc.hasServicesEnabledAsync(); } catch (e) { on = true; }
  if (!on) throw new Error('Please turn on GPS / Location services');
  const perm = await Loc.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') throw new Error('Location permission was not given');
  let pos;
  try {
    pos = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.High });
  } catch (e) {
    pos = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
  }
  let g = [];
  try {
    g = await Loc.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
  } catch (e) {}
  const a = g.find((x) => x && (x.street || x.name) && (x.district || x.city)) || g[0] || {};
  const city = a.city || a.subregion || '';
  let area = a.district || a.street || a.name || city || a.region || 'Current location';
  if (city && area !== city) area = area + ', ' + city;
  const seen = {};
  const parts = [a.name, a.street, a.district, a.city || a.subregion, a.region, a.postalCode]
    .filter(Boolean).map(String).filter((p) => { const k = p.toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; });
  const full = parts.join(', ');
  return { area, full, lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Pick a QR code image from the phone gallery -> returns a data: URI (or null when cancelled)
async function pickQrImage() {
  if (!Pick) throw new Error('Image upload is not available. Install expo-image-picker or paste a photo link.');
  const perm = await Pick.requestMediaLibraryPermissionsAsync();
  if (!perm || perm.granted === false) throw new Error('Photo permission was not given');
  const r = await Pick.launchImageLibraryAsync({
    mediaTypes: Pick.MediaTypeOptions ? Pick.MediaTypeOptions.Images : ['images'],
    allowsEditing: true,
    quality: 0.5,
    base64: true,
  });
  if (!r || r.canceled || r.cancelled) return null;
  const a = r.assets && r.assets[0];
  if (!a || !a.base64) throw new Error('Could not read the image. Please try another photo.');
  if (a.base64.length > 900000) throw new Error('Image is too large. Please choose a smaller image or paste a link.');
  return 'data:' + (a.mimeType || 'image/jpeg') + ';base64,' + a.base64;
}

// ======================================================================
// LANGUAGE (English / Hindi / Odia). Text missing here simply stays English.
// [English, Hindi, Odia]   {0} {1} = any text, {n} = number
// ======================================================================
let LANG = 'en';
const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['or', 'ଓଡ଼ିଆ']];
const D = [
  ['Home', 'होम', 'ହୋମ୍'],
  ['Categories', 'श्रेणियाँ', 'ବର୍ଗ'],
  ['Cart', 'कार्ट', 'କାର୍ଟ'],
  ['Orders', 'ऑर्डर', 'ଅର୍ଡର'],
  ['Profile', 'प्रोफ़ाइल', 'ପ୍ରୋଫାଇଲ୍'],
  ['Dashboard', 'डैशबोर्ड', 'ଡ୍ୟାସବୋର୍ଡ'],
  ['Products', 'प्रोडक्ट', 'ପ୍ରଡକ୍ଟ'],
  ['More', 'और', 'ଅଧିକ'],
  ['Add', 'जोड़ें', 'ଯୋଡ଼ନ୍ତୁ'],
  ['← Back', '← वापस', '← ପଛକୁ'],
  ['Close', 'बंद करें', 'ବନ୍ଦ କରନ୍ତୁ'],
  ['Language', 'भाषा', 'ଭାଷା'],
  ['Save', 'सेव करें', 'ସେଭ୍ କରନ୍ତୁ'],
  ['Login', 'लॉगिन', 'ଲଗ୍‌ଇନ୍'],
  ['Log Out', 'लॉग आउट', 'ଲଗ୍ ଆଉଟ୍'],
  ['Create a new account', 'नया अकाउंट बनाएँ', 'ନୂଆ ଆକାଉଣ୍ଟ ଖୋଲନ୍ତୁ'],
  ['Create account', 'अकाउंट बनाएँ', 'ଆକାଉଣ୍ଟ ଖୋଲନ୍ତୁ'],
  ['Already have an account? Log in',
    'पहले से अकाउंट है? लॉगिन करें',
    'ଆଗରୁ ଆକାଉଣ୍ଟ ଅଛି? ଲଗ୍‌ଇନ୍ କରନ୍ତୁ'],
  ['Email', 'ईमेल', 'ଇମେଲ୍'],
  ['Password (6+ characters)', 'पासवर्ड (6+ अक्षर)', 'ପାସୱାର୍ଡ (6+ ଅକ୍ଷର)'],
  ['Please wait...', 'कृपया प्रतीक्षा करें...', 'ଦୟାକରି ଅପେକ୍ଷା କରନ୍ତୁ...'],
  ['Enter a valid email and a password of 6+ characters',
    'सही ईमेल और 6+ अक्षर का पासवर्ड डालें',
    'ସଠିକ୍ ଇମେଲ୍ ଓ 6+ ଅକ୍ଷରର ପାସୱାର୍ଡ ଦିଅନ୍ତୁ'],
  ['Account created. Please log in.',
    'अकाउंट बन गया। कृपया लॉगिन करें।',
    'ଆକାଉଣ୍ଟ ଖୋଲାଗଲା। ଦୟାକରି ଲଗ୍‌ଇନ୍ କରନ୍ତୁ।'],
  ['Email login is for testing. Phone OTP will come at launch.',
    'ईमेल लॉगिन सिर्फ़ टेस्ट के लिए है। लॉन्च पर फ़ोन OTP आएगा।',
    'ଇମେଲ୍ ଲଗ୍‌ଇନ୍ କେବଳ ପରୀକ୍ଷା ପାଇଁ। ଲଞ୍ଚ ସମୟରେ ଫୋନ୍ OTP ଆସିବ।'],
  ['Welcome to NearKart', 'NearKart में स्वागत है', 'NearKart କୁ ସ୍ୱାଗତ'],
  ['Login or sign up to continue',
    'आगे बढ़ने के लिए लॉगिन या साइन-अप करें',
    'ଆଗକୁ ବଢ଼ିବାକୁ ଲଗ୍‌ଇନ୍ କିମ୍ବା ସାଇନ୍-ଅପ୍ କରନ୍ତୁ'],
  ['Continue browsing', 'ब्राउज़ करते रहें', 'ବ୍ରାଉଜ୍ ଜାରି ରଖନ୍ତୁ'],
  ['Hello,', 'नमस्ते,', 'ନମସ୍କାର,'],
  ['Shopper!', 'ग्राहक!', 'ଗ୍ରାହକ!'],
  ['Delivering to', 'डिलीवरी:', 'ଡେଲିଭରି:'],
  ['Select your location', 'अपनी लोकेशन चुनें', 'ଆପଣଙ୍କ ଲୋକେସନ୍ ବାଛନ୍ତୁ'],
  ['Use my current location',
    'मेरी मौजूदा लोकेशन इस्तेमाल करें',
    'ମୋ ବର୍ତ୍ତମାନ ଲୋକେସନ୍ ବ୍ୟବହାର କରନ୍ତୁ'],
  ['Delivery Location', 'डिलीवरी लोकेशन', 'ଡେଲିଭରି ଲୋକେସନ୍'],
  ['Search products, shops, and categories',
    'प्रोडक्ट, दुकान और श्रेणी खोजें',
    'ପ୍ରଡକ୍ଟ, ଦୋକାନ ଓ ବର୍ଗ ଖୋଜନ୍ତୁ'],
  ['Explore Categories', 'श्रेणियाँ देखें', 'ବର୍ଗ ଦେଖନ୍ତୁ'],
  ['View All →', 'सभी देखें →', 'ସବୁ ଦେଖନ୍ତୁ →'],
  ['View All', 'सभी देखें', 'ସବୁ ଦେଖନ୍ତୁ'],
  ['Great deals', 'शानदार डील्स', 'ଭଲ ଡିଲ୍'],
  ['near you', 'आपके पास', 'ଆପଣଙ୍କ ପାଖରେ'],
  ['Discover offers from local shops',
    'स्थानीय दुकानों के ऑफ़र देखें',
    'ସ୍ଥାନୀୟ ଦୋକାନର ଅଫର୍ ଦେଖନ୍ତୁ'],
  ['Shops Near You', 'आपके पास की दुकानें', 'ଆପଣଙ୍କ ପାଖ ଦୋକାନ'],
  ['Popular Products', 'लोकप्रिय प्रोडक्ट', 'ଲୋକପ୍ରିୟ ପ୍ରଡକ୍ଟ'],
  ['Open now', 'अभी खुला', 'ବର୍ତ୍ତମାନ ଖୋଲା'],
  ['No shops have joined yet.',
    'अभी कोई दुकान नहीं जुड़ी है।',
    'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଦୋକାନ ଯୋଡ଼ି ହୋଇନାହିଁ।'],
  ['No results found.', 'कोई नतीजा नहीं मिला।', 'କୌଣସି ଫଳାଫଳ ମିଳିଲା ନାହିଁ।'],
  ['All Categories', 'सभी श्रेणियाँ', 'ସମସ୍ତ ବର୍ଗ'],
  ['Grocery', 'किराना', 'ମୁଦିଖାନା'],
  ['Fashion', 'फ़ैशन', 'ଫ୍ୟାସନ୍'],
  ['Electronics', 'इलेक्ट्रॉनिक्स', 'ଇଲେକ୍ଟ୍ରୋନିକ୍ସ'],
  ['Beauty', 'ब्यूटी', 'ବ୍ୟୁଟି'],
  ['Pharmacy', 'फ़ार्मेसी', 'ଫାର୍ମାସି'],
  ['Food', 'खाना', 'ଖାଦ୍ୟ'],
  ['Sabzi-Phal', 'सब्ज़ी-फल', 'ପନିପରିବା ଓ ଫଳ'],
  ['Dudh-Dairy', 'दूध-डेयरी', 'ଦୁଧ ଓ ଡେୟାରୀ'],
  ['Atta, Rice & Dal', 'आटा, चावल और दाल', 'ଆଟା, ଚାଉଳ ଓ ଡାଲି'],
  ['Oil & Ghee', 'तेल और घी', 'ତେଲ ଓ ଘିଅ'],
  ['Masala', 'मसाले', 'ମସଲା'],
  ['Snacks', 'नाश्ता', 'ସ୍ନାକ୍ସ'],
  ['Beverages', 'पेय', 'ପାନୀୟ'],
  ['Dairy', 'डेयरी', 'ଡେୟାରୀ'],
  ['Sabzi', 'सब्ज़ी', 'ପନିପରିବା'],
  ['Phal', 'फल', 'ଫଳ'],
  ['Personal Care', 'पर्सनल केयर', 'ପର୍ସନାଲ୍ କେୟାର'],
  ['Home Care', 'होम केयर', 'ହୋମ୍ କେୟାର'],
  ['Mobile & Accessories', 'मोबाइल और एक्सेसरीज़', 'ମୋବାଇଲ୍ ଓ ଆକ୍ସେସୋରି'],
  ['Other', 'अन्य', 'ଅନ୍ୟାନ୍ୟ'],
  ['Search in this shop', 'इस दुकान में खोजें', 'ଏହି ଦୋକାନରେ ଖୋଜନ୍ତୁ'],
  ['Price range (₹)', 'कीमत सीमा (₹)', 'ମୂଲ୍ୟ ସୀମା (₹)'],
  ['Min', 'कम से कम', 'ସର୍ବନିମ୍ନ'],
  ['Max', 'ज़्यादा से ज़्यादा', 'ସର୍ବାଧିକ'],
  ['All', 'सभी', 'ସମସ୍ତ'],
  ['No products found.', 'कोई प्रोडक्ट नहीं मिला।', 'କୌଣସି ପ୍ରଡକ୍ଟ ମିଳିଲା ନାହିଁ।'],
  ['Out of stock', 'स्टॉक खत्म', 'ଷ୍ଟକ୍ ସରିଛି'],
  ['Only {0} left', 'सिर्फ़ {0} बचा है', 'କେବଳ {0} ବାକି ଅଛି'],
  ['View Cart →', 'कार्ट देखें →', 'କାର୍ଟ ଦେଖନ୍ତୁ →'],
  ['{n} items •', '{n} आइटम •', '{n} ଆଇଟମ୍ •'],
  ['● Open', '● खुला', '● ଖୋଲା'],
  ['● Closed', '● बंद', '● ବନ୍ଦ'],
  ['New', 'नया', 'ନୂଆ'],
  ['How much do you need?', 'कितना चाहिए?', 'କେତେ ଦରକାର?'],
  ['Or type your own amount', 'या अपनी मात्रा लिखें', 'କିମ୍ବା ନିଜେ ପରିମାଣ ଲେଖନ୍ତୁ'],
  ['(e.g. 750 g)', '(जैसे 750 g)', '(ଯେପରି 750 g)'],
  ['Not enough stock', 'इतना स्टॉक नहीं है', 'ଏତେ ଷ୍ଟକ୍ ନାହିଁ'],
  ['In stock', 'स्टॉक में है', 'ଷ୍ଟକ୍‌ରେ ଅଛି'],
  ['Add to cart • {0}', 'कार्ट में जोड़ें • {0}', 'କାର୍ଟରେ ଯୋଡ଼ନ୍ତୁ • {0}'],
  ['Enter a valid amount', 'सही मात्रा डालें', 'ସଠିକ୍ ପରିମାଣ ଦିଅନ୍ତୁ'],
  ['The shop is closed right now.', 'दुकान अभी बंद है।', 'ଦୋକାନ ବର୍ତ୍ତମାନ ବନ୍ଦ ଅଛି।'],
  ['Your cart is empty.', 'आपका कार्ट खाली है।', 'ଆପଣଙ୍କ କାର୍ଟ ଖାଲି ଅଛି।'],
  ['Open a shop and add products.',
    'कोई दुकान खोलकर प्रोडक्ट जोड़ें।',
    'କୌଣସି ଦୋକାନ ଖୋଲି ପ୍ରଡକ୍ଟ ଯୋଡ଼ନ୍ତୁ।'],
  ['Remove', 'हटाएँ', 'ହଟାନ୍ତୁ'],
  ['Total', 'कुल', 'ମୋଟ'],
  ['Delivery: agree with the shop (free for now)',
    'डिलीवरी: दुकान से तय करें (अभी मुफ़्त)',
    'ଡେଲିଭରି: ଦୋକାନ ସହ ଠିକ୍ କରନ୍ତୁ (ବର୍ତ୍ତମାନ ମାଗଣା)'],
  ['Delivery details', 'डिलीवरी की जानकारी', 'ଡେଲିଭରି ବିବରଣୀ'],
  ['Your name', 'आपका नाम', 'ଆପଣଙ୍କ ନାମ'],
  ['Phone (10 digits)', 'फ़ोन (10 अंक)', 'ଫୋନ୍ (10 ଅଙ୍କ)'],
  ['Full address', 'पूरा पता', 'ପୂର୍ଣ୍ଣ ଠିକଣା'],
  ['Payment', 'भुगतान', 'ପେମେଣ୍ଟ'],
  ['Cash on Delivery', 'कैश ऑन डिलीवरी', 'କ୍ୟାସ୍ ଅନ୍ ଡେଲିଭରି'],
  ['Selected', 'चुना हुआ', 'ବଛାଯାଇଛି'],
  ['UPI online payment is coming soon.',
    'UPI ऑनलाइन भुगतान जल्द आएगा।',
    'UPI ଅନଲାଇନ୍ ପେମେଣ୍ଟ ଶୀଘ୍ର ଆସିବ।'],
  ['Place order • {0}', 'ऑर्डर करें • {0}', 'ଅର୍ଡର କରନ୍ତୁ • {0}'],
  ['Enter name, 10-digit phone and address',
    'नाम, 10 अंक का फ़ोन और पता भरें',
    'ନାମ, 10 ଅଙ୍କର ଫୋନ୍ ଓ ଠିକଣା ଦିଅନ୍ତୁ'],
  ['Different shop', 'दूसरी दुकान', 'ଅନ୍ୟ ଦୋକାନ'],
  ['Your cart has items from another shop. Clear it?',
    'आपके कार्ट में दूसरी दुकान का सामान है। उसे हटा दें?',
    'ଆପଣଙ୍କ କାର୍ଟରେ ଅନ୍ୟ ଦୋକାନର ସାମଗ୍ରୀ ଅଛି। ହଟାଇବେ?'],
  ['Yes', 'हाँ', 'ହଁ'],
  ['No', 'नहीं', 'ନା'],
  ['Order placed', 'ऑर्डर', 'ଅର୍ଡର'],
  ['successfully!', 'सफलतापूर्वक हो गया!', 'ସଫଳତାର ସହ ହୋଇଗଲା!'],
  ['will confirm within 10 minutes',
    '10 मिनट में कन्फ़र्म करेगी',
    '10 ମିନିଟ୍ ମଧ୍ୟରେ ନିଶ୍ଚିତ କରିବେ'],
  ['View my orders', 'मेरे ऑर्डर देखें', 'ମୋ ଅର୍ଡର ଦେଖନ୍ତୁ'],
  ['Go to Home', 'होम पर जाएँ', 'ହୋମ୍‌କୁ ଯାଆନ୍ତୁ'],
  ['My Orders', 'मेरे ऑर्डर', 'ମୋ ଅର୍ଡର'],
  ['Track live orders and view past purchases',
    'लाइव ऑर्डर ट्रैक करें और पुरानी खरीदारी देखें',
    'ଲାଇଭ୍ ଅର୍ଡର ଟ୍ରାକ୍ କରନ୍ତୁ ଓ ପୁରୁଣା କିଣାକିଣି ଦେଖନ୍ତୁ'],
  ['No orders yet.', 'अभी कोई ऑर्डर नहीं।', 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ଅର୍ଡର ନାହିଁ।'],
  ['Cancel order', 'ऑर्डर रद्द करें', 'ଅର୍ଡର ବାତିଲ୍ କରନ୍ତୁ'],
  ['Accepted', 'स्वीकार किया', 'ଗ୍ରହଣ ହୋଇଛି'],
  ['Out for delivery', 'डिलीवरी के लिए निकला', 'ଡେଲିଭରି ପାଇଁ ବାହାରିଛି'],
  ['Delivered', 'पहुँच गया', 'ପହଞ୍ଚିଗଲା'],
  ['Cancelled', 'रद्द', 'ବାତିଲ୍'],
  ['Preparing', 'तैयार हो रहा है', 'ପ୍ରସ୍ତୁତ ହେଉଛି'],
  ['Ready', 'तैयार', 'ପ୍ରସ୍ତୁତ'],
  ['New {n}', 'नया {n}', 'ନୂଆ {n}'],
  ['Accepted {n}', 'स्वीकार किया {n}', 'ଗ୍ରହଣ {n}'],
  ['Out for delivery {n}', 'डिलीवरी पर {n}', 'ଡେଲିଭରିରେ {n}'],
  ['Delivered {n}', 'पहुँचा {n}', 'ପହଞ୍ଚିଛି {n}'],
  ['Cancelled {n}', 'रद्द {n}', 'ବାତିଲ୍ {n}'],
  ['Preparing {n}', 'तैयार हो रहा {n}', 'ପ୍ରସ୍ତୁତ ହେଉଛି {n}'],
  ['Ready {n}', 'तैयार {n}', 'ପ୍ରସ୍ତୁତ {n}'],
  ['Cancelled by customer', 'ग्राहक ने रद्द किया', 'ଗ୍ରାହକ ବାତିଲ୍ କଲେ'],
  ['Rejected by shop', 'दुकान ने अस्वीकार किया', 'ଦୋକାନ ପ୍ରତ୍ୟାଖ୍ୟାନ କଲା'],
  ['Shop did not respond within 10 minutes',
    'दुकान ने 10 मिनट में जवाब नहीं दिया',
    'ଦୋକାନ 10 ମିନିଟ୍ ମଧ୍ୟରେ ଉତ୍ତର ଦେଲା ନାହିଁ'],
  // order tracking / order details
  ['My Order', 'मेरा ऑर्डर', 'ମୋ ଅର୍ଡର'],
  ['Help', 'मदद', 'ସାହାଯ୍ୟ'],
  ['Estimated Delivery', 'अनुमानित डिलीवरी', 'ଅନୁମାନିତ ଡେଲିଭରି'],
  ['Order Status', 'ऑर्डर की स्थिति', 'ଅର୍ଡର ସ୍ଥିତି'],
  ['Order Placed', 'ऑर्डर हो गया', 'ଅର୍ଡର ହୋଇଛି'],
  ['Order Accepted', 'ऑर्डर स्वीकार', 'ଅର୍ଡର ଗ୍ରହଣ'],
  ['Out for Delivery', 'डिलीवरी के लिए निकला', 'ଡେଲିଭରି ପାଇଁ ବାହାରିଛି'],
  ['Your order has been placed', 'आपका ऑर्डर हो गया है', 'ଆପଣଙ୍କ ଅର୍ଡର ହୋଇଛି'],
  ['The shop accepted your order',
    'दुकान ने आपका ऑर्डर स्वीकार किया',
    'ଦୋକାନ ଆପଣଙ୍କ ଅର୍ଡର ଗ୍ରହଣ କଲା'],
  ['Seller is preparing your order',
    'विक्रेता आपका ऑर्डर तैयार कर रहा है',
    'ବିକ୍ରେତା ଆପଣଙ୍କ ଅର୍ଡର ପ୍ରସ୍ତୁତ କରୁଛନ୍ତି'],
  ['Your order will be ready soon',
    'आपका ऑर्डर जल्द तैयार होगा',
    'ଆପଣଙ୍କ ଅର୍ଡର ଶୀଘ୍ର ପ୍ରସ୍ତୁତ ହେବ'],
  ['Your order is on the way', 'आपका ऑर्डर रास्ते में है', 'ଆପଣଙ୍କ ଅର୍ଡର ବାଟରେ ଅଛି'],
  ['Your order will be delivered', 'आपका ऑर्डर पहुँचाया जाएगा', 'ଆପଣଙ୍କ ଅର୍ଡର ପହଞ୍ଚାଯିବ'],
  ['Order cancelled', 'ऑर्डर रद्द हुआ', 'ଅର୍ଡର ବାତିଲ୍ ହୋଇଛି'],
  ['Delivery Information', 'डिलीवरी की जानकारी', 'ଡେଲିଭରି ସୂଚନା'],
  ['Home Delivery', 'होम डिलीवरी', 'ହୋମ୍ ଡେଲିଭରି'],
  ['View on Map', 'मैप पर देखें', 'ମ୍ୟାପ୍‌ରେ ଦେଖନ୍ତୁ'],
  ['Order Summary', 'ऑर्डर सारांश', 'ଅର୍ଡର ସାରାଂଶ'],
  ['Items', 'आइटम', 'ଆଇଟମ୍'],
  ['Subtotal', 'उप-कुल', 'ଉପମୋଟ'],
  ['Delivery Charge', 'डिलीवरी शुल्क', 'ଡେଲିଭରି ଚାର୍ଜ'],
  ['Free', 'मुफ़्त', 'ମାଗଣା'],
  ['Total Amount', 'कुल रकम', 'ମୋଟ ରାଶି'],
  ['View Details', 'विवरण देखें', 'ବିବରଣୀ ଦେଖନ୍ତୁ'],
  ['Need Help?', 'मदद चाहिए?', 'ସାହାଯ୍ୟ ଦରକାର?'],
  ['Chat with us or call the store',
    'हमसे चैट करें या दुकान को कॉल करें',
    'ଆମ ସହ ଚାଟ୍ କରନ୍ତୁ କିମ୍ବା ଦୋକାନକୁ କଲ୍ କରନ୍ତୁ'],
  ['Reorder', 'दोबारा ऑर्डर करें', 'ପୁନଃ ଅର୍ଡର କରନ୍ତୁ'],
  ['Products not available', 'प्रोडक्ट उपलब्ध नहीं हैं', 'ପ୍ରଡକ୍ଟ ଉପଲବ୍ଧ ନାହିଁ'],
  ['Order Details', 'ऑर्डर विवरण', 'ଅର୍ଡର ବିବରଣୀ'],
  ['Call', 'कॉल', 'କଲ୍'],
  ['Order Items', 'ऑर्डर आइटम', 'ଅର୍ଡର ଆଇଟମ୍'],
  ['View Bill / Invoice', 'बिल / इनवॉइस देखें', 'ବିଲ୍ / ଇନଭଏସ୍ ଦେଖନ୍ତୁ'],
  ['Update Order Status', 'ऑर्डर स्थिति अपडेट करें', 'ଅର୍ଡର ସ୍ଥିତି ଅପଡେଟ୍ କରନ୍ତୁ'],
  ['Update the status as per the order progress.',
    'ऑर्डर की प्रगति के अनुसार स्थिति अपडेट करें।',
    'ଅର୍ଡର ଅଗ୍ରଗତି ଅନୁସାରେ ସ୍ଥିତି ଅପଡେଟ୍ କରନ୍ତୁ।'],
  ['Accept Order', 'ऑर्डर स्वीकार करें', 'ଅର୍ଡର ଗ୍ରହଣ କରନ୍ତୁ'],
  ['Reject Order', 'ऑर्डर अस्वीकार करें', 'ଅର୍ଡର ପ୍ରତ୍ୟାଖ୍ୟାନ'],
  ['Start Preparing', 'तैयारी शुरू करें', 'ପ୍ରସ୍ତୁତି ଆରମ୍ଭ'],
  ['Mark as Ready', 'तैयार चिह्नित करें', 'ପ୍ରସ୍ତୁତ ବୋଲି ଚିହ୍ନିତ'],
  ['Mark as Delivered', 'डिलीवर चिह्नित करें', 'ଡେଲିଭର୍ ବୋଲି ଚିହ୍ନିତ'],
  // new in this version
  ['Pickup', 'पिकअप', 'ପିକଅପ୍'],
  ['Pickup from shop', 'दुकान से पिकअप', 'ଦୋକାନରୁ ପିକଅପ୍'],
  ['Delivery type', 'डिलीवरी का तरीका', 'ଡେଲିଭରି ପ୍ରକାର'],
  ['UPI', 'UPI', 'UPI'],
  ['Load more', 'और दिखाएँ', 'ଅଧିକ ଦେଖାନ୍ତୁ'],
  ['Inactive', 'निष्क्रिय', 'ନିଷ୍କ୍ରିୟ'],
  ['Activate', 'चालू करें', 'ଚାଲୁ କରନ୍ତୁ'],
  ['Deactivate', 'बंद करें', 'ବନ୍ଦ କରନ୍ତୁ'],
  ['You may also like', 'आपको ये भी पसंद आ सकते हैं', 'ଆପଣଙ୍କୁ ଏସବୁ ମଧ୍ୟ ଭଲ ଲାଗିପାରେ'],
  ['Out of stock here. Available alternatives:',
    'यहाँ स्टॉक खत्म है। उपलब्ध विकल्प:',
    'ଏଠାରେ ଷ୍ଟକ୍ ସରିଛି। ଉପଲବ୍ଧ ବିକଳ୍ପ:'],
  ['Original price (₹, optional)', 'असली कीमत (₹, वैकल्पिक)', 'ମୂଳ ମୂଲ୍ୟ (₹, ଇଚ୍ଛାଧୀନ)'],
  ['Description (optional)', 'विवरण (वैकल्पिक)', 'ବିବରଣୀ (ଇଚ୍ଛାଧୀନ)'],
  ['Low stock alert at', 'कम स्टॉक अलर्ट', 'କମ୍ ଷ୍ଟକ୍ ଆଲର୍ଟ'],
  ['Save profile', 'प्रोफ़ाइल सेव करें', 'ପ୍ରୋଫାଇଲ୍ ସେଭ୍ କରନ୍ତୁ'],
  ['UPI payment is confirmed only after the shop verifies it.',
    'UPI भुगतान तभी पक्का होगा जब दुकान उसे जाँच ले।',
    'UPI ପେମେଣ୍ଟ ଦୋକାନ ଯାଞ୍ଚ କଲା ପରେ ହିଁ ନିଶ୍ଚିତ ହେବ।'],
  // payment
  ['Payment Account', 'पेमेंट अकाउंट', 'ପେମେଣ୍ଟ ଆକାଉଣ୍ଟ'],
  ['UPI ID', 'UPI आईडी', 'UPI ଆଇଡି'],
  ['UTR Number', 'UTR नंबर', 'UTR ନମ୍ବର'],
  ['Payment verified', 'भुगतान सत्यापित', 'ପେମେଣ୍ଟ ଯାଞ୍ଚ ହୋଇଛି'],
  ['Pay with UPI', 'UPI से भुगतान करें', 'UPI ରେ ପେମେଣ୍ଟ କରନ୍ତୁ'],
  ['Open UPI app', 'UPI ऐप खोलें', 'UPI ଆପ୍ ଖୋଲନ୍ତୁ'],
  // seller
  ['Guest', 'अतिथि', 'ଅତିଥି'],
  ['Saved Addresses', 'सेव किए पते', 'ସେଭ୍ ଠିକଣା'],
  ['Customer Support', 'कस्टमर सपोर्ट', 'ଗ୍ରାହକ ସହାୟତା'],
  ['Instant chat & order queries', 'चैट और ऑर्डर संबंधी सवाल', 'ଚାଟ୍ ଓ ଅର୍ଡର ପ୍ରଶ୍ନ'],
  ['End shopping session', 'शॉपिंग सेशन खत्म करें', 'ସେସନ୍ ଶେଷ କରନ୍ତୁ'],
  ['Manage inventory, live orders & shop promotion',
    'इन्वेंटरी, लाइव ऑर्डर और दुकान प्रमोशन संभालें',
    'ଇନଭେଣ୍ଟୋରୀ, ଲାଇଭ୍ ଅର୍ଡର ଓ ପ୍ରଚାର ସମ୍ଭାଳନ୍ତୁ'],
  ['Enter Partner Hub', 'पार्टनर हब खोलें', 'ପାର୍ଟନର୍ ହବ୍ ଖୋଲନ୍ତୁ'],
  ['Become a NearKart Partner', 'NearKart पार्टनर बनें', 'NearKart ପାର୍ଟନର୍ ହୁଅନ୍ତୁ'],
  ['Login to become a Partner', 'पार्टनर बनने के लिए लॉगिन करें', 'ପାର୍ଟନର୍ ହେବାକୁ ଲଗ୍‌ଇନ୍ କରନ୍ତୁ'],
  ['Sell your products online and reach shoppers near you',
    'अपने प्रोडक्ट ऑनलाइन बेचें और पास के ग्राहकों तक पहुँचें',
    'ଆପଣଙ୍କ ପ୍ରଡକ୍ଟ ଅନଲାଇନ୍ ବିକ୍ରି କରନ୍ତୁ'],
  // profile business card
  ['Establish Your Local Business Presence',
    'अपने लोकल बिज़नेस की पहचान बनाएँ',
    'ଆପଣଙ୍କ ସ୍ଥାନୀୟ ବ୍ୟବସାୟର ପରିଚୟ ତିଆରି କରନ୍ତୁ'],
  ['Create your unique shop profile and connect directly with local customers. A simple process to list your products and take orders.',
    'अपनी दुकान की अनोखी प्रोफ़ाइल बनाएँ और सीधे स्थानीय ग्राहकों से जुड़ें। प्रोडक्ट लिस्ट करने और ऑर्डर लेने की आसान प्रक्रिया।',
    'ଆପଣଙ୍କ ଦୋକାନର ନିଜସ୍ୱ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ ଏବଂ ସିଧାସଳଖ ସ୍ଥାନୀୟ ଗ୍ରାହକଙ୍କ ସହ ଯୋଡ଼ିହୁଅନ୍ତୁ। ପ୍ରଡକ୍ଟ ତାଲିକାଭୁକ୍ତ କରିବା ଓ ଅର୍ଡର ନେବା ପାଇଁ ସହଜ ପ୍ରକ୍ରିୟା।'],
  ['Create a Shop Profile', 'दुकान प्रोफ़ाइल बनाएँ', 'ଦୋକାନ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ'],
  ['Manage Your Local Business',
    'अपना लोकल बिज़नेस संभालें',
    'ଆପଣଙ୍କ ସ୍ଥାନୀୟ ବ୍ୟବସାୟ ପରିଚାଳନା କରନ୍ତୁ'],
  ['Your shop is live. Open the Partner Hub to manage products, orders and offers.',
    'आपकी दुकान लाइव है। प्रोडक्ट, ऑर्डर और ऑफ़र संभालने के लिए पार्टनर हब खोलें।',
    'ଆପଣଙ୍କ ଦୋକାନ ଲାଇଭ୍ ଅଛି। ପ୍ରଡକ୍ଟ, ଅର୍ଡର ଓ ଅଫର୍ ପରିଚାଳନା ପାଇଁ ପାର୍ଟନର୍ ହବ୍ ଖୋଲନ୍ତୁ।'],
  ['Register your shop', 'अपनी दुकान जोड़ें', 'ଆପଣଙ୍କ ଦୋକାନ ଯୋଡ଼ନ୍ତୁ'],
  ['Shop name', 'दुकान का नाम', 'ଦୋକାନର ନାମ'],
  ['Owner name', 'मालिक का नाम', 'ମାଲିକଙ୍କ ନାମ'],
  ['Phone number', 'फ़ोन नंबर', 'ଫୋନ୍ ନମ୍ବର'],
  ['Village / Area', 'गाँव / क्षेत्र', 'ଗାଁ / ଅଞ୍ଚଳ'],
  ['Shop photo link (optional)',
    'दुकान की फ़ोटो का लिंक (वैकल्पिक)',
    'ଦୋକାନ ଫଟୋ ଲିଙ୍କ୍ (ଇଚ୍ଛାଧୀନ)'],
  ['Category', 'श्रेणी', 'ବର୍ଗ'],
  ['Open my shop', 'मेरी दुकान खोलें', 'ମୋ ଦୋକାନ ଖୋଲନ୍ତୁ'],
  ['Enter shop name, owner, 10-digit phone and area',
    'दुकान का नाम, मालिक, 10 अंक का फ़ोन और क्षेत्र भरें',
    'ଦୋକାନ ନାମ, ମାଲିକ, 10 ଅଙ୍କର ଫୋନ୍ ଓ ଅଞ୍ଚଳ ଦିଅନ୍ତୁ'],
  ["Today's Summary", 'आज का सारांश', 'ଆଜିର ସାରାଂଶ'],
  ['New Orders', 'नए ऑर्डर', 'ନୂଆ ଅର୍ଡର'],
  ['Total Orders', 'कुल ऑर्डर', 'ମୋଟ ଅର୍ଡର'],
  ['Total Sales', 'कुल बिक्री', 'ମୋଟ ବିକ୍ରି'],
  ['Shop Rating', 'दुकान रेटिंग', 'ଦୋକାନ ରେଟିଂ'],
  ['Live Shop Advertisement', 'लाइव दुकान विज्ञापन', 'ଲାଇଭ୍ ଦୋକାନ ବିଜ୍ଞାପନ'],
  ['Published', 'प्रकाशित', 'ପ୍ରକାଶିତ'],
  ['Empty', 'खाली', 'ଖାଲି'],
  ['Offer (shown to customers)', 'ऑफ़र (ग्राहकों को दिखेगा)', 'ଅଫର୍ (ଗ୍ରାହକଙ୍କୁ ଦେଖାଯିବ)'],
  ['Publish', 'प्रकाशित करें', 'ପ୍ରକାଶ କରନ୍ତୁ'],
  ['Stock alert', 'स्टॉक अलर्ट', 'ଷ୍ଟକ୍ ଆଲର୍ଟ'],
  ['Recent Customer Orders', 'हाल के ग्राहक ऑर्डर', 'ସମ୍ପ୍ରତି ଗ୍ରାହକ ଅର୍ଡର'],
  ['✅ Saved', '✅ सेव हो गया', '✅ ସେଭ୍ ହୋଇଗଲା'],
  ['Seller Orders', 'सेलर ऑर्डर', 'ସେଲର୍ ଅର୍ଡର'],
  ['Real-time incoming orders', 'आने वाले ऑर्डर, रियल-टाइम', 'ଆସୁଥିବା ଅର୍ଡର, ରିଅଲ୍-ଟାଇମ୍'],
  ['No orders in this list.', 'इस सूची में कोई ऑर्डर नहीं।', 'ଏହି ତାଲିକାରେ କୌଣସି ଅର୍ଡର ନାହିଁ।'],
  ['⏱ {n} min left', '⏱ {n} मिनट बाकी', '⏱ {n} ମିନିଟ୍ ବାକି'],
  ['Accept', 'स्वीकार करें', 'ଗ୍ରହଣ କରନ୍ତୁ'],
  ['Reject', 'अस्वीकार करें', 'ପ୍ରତ୍ୟାଖ୍ୟାନ'],
  ['🔔 New order received!', '🔔 नया ऑर्डर आया!', '🔔 ନୂଆ ଅର୍ଡର ଆସିଲା!'],
  ['Tap to view', 'देखने के लिए दबाएँ', 'ଦେଖିବାକୁ ଦବାନ୍ତୁ'],
  ['All Products', 'सभी प्रोडक्ट', 'ସମସ୍ତ ପ୍ରଡକ୍ଟ'],
  ['{n} products in total', 'कुल {n} प्रोडक्ट', 'ମୋଟ {n} ପ୍ରଡକ୍ଟ'],
  ['+ Add Product', '+ प्रोडक्ट जोड़ें', '+ ପ୍ରଡକ୍ଟ ଯୋଡ଼ନ୍ତୁ'],
  ['New product', 'नया प्रोडक्ट', 'ନୂଆ ପ୍ରଡକ୍ଟ'],
  ['Edit product', 'प्रोडक्ट बदलें', 'ପ୍ରଡକ୍ଟ ବଦଳାନ୍ତୁ'],
  ['Name', 'नाम', 'ନାମ'],
  ['Unit (how you sell it)', 'इकाई (कैसे बेचते हैं)', 'ୟୁନିଟ୍ (କେମିତି ବିକ୍ରି କରନ୍ତି)'],
  ['Price (₹ per {0})', 'कीमत (₹ प्रति {0})', 'ମୂଲ୍ୟ (₹ ପ୍ରତି {0})'],
  ['Online stock ({0})', 'ऑनलाइन स्टॉक ({0})', 'ଅନଲାଇନ୍ ଷ୍ଟକ୍ ({0})'],
  ['Shop stock ({0}, counter only)',
    'दुकान का स्टॉक ({0}, सिर्फ़ काउंटर)',
    'ଦୋକାନ ଷ୍ଟକ୍ ({0}, କେବଳ କାଉଣ୍ଟର)'],
  ['Photo link (optional)', 'फ़ोटो का लिंक (वैकल्पिक)', 'ଫଟୋ ଲିଙ୍କ୍ (ଇଚ୍ଛାଧୀନ)'],
  ['Add product', 'प्रोडक्ट जोड़ें', 'ପ୍ରଡକ୍ଟ ଯୋଡ଼ନ୍ତୁ'],
  ['No products yet.', 'अभी कोई प्रोडक्ट नहीं।', 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ପ୍ରଡକ୍ଟ ନାହିଁ।'],
  ['✅ Product added', '✅ प्रोडक्ट जुड़ गया', '✅ ପ୍ରଡକ୍ଟ ଯୋଡ଼ାଗଲା'],
  ['Enter name, price and online stock',
    'नाम, कीमत और ऑनलाइन स्टॉक भरें',
    'ନାମ, ମୂଲ୍ୟ ଓ ଅନଲାଇନ୍ ଷ୍ଟକ୍ ଦିଅନ୍ତୁ'],
  ['Online', 'ऑनलाइन', 'ଅନଲାଇନ୍'],
  ['Shop', 'दुकान', 'ଦୋକାନ'],
  ['Price', 'कीमत', 'ମୂଲ୍ୟ'],
  ['+10 online', '+10 ऑनलाइन', '+10 ଅନଲାଇନ୍'],
  ['Low stock', 'कम स्टॉक', 'କମ୍ ଷ୍ଟକ୍'],
  ['Search products...', 'प्रोडक्ट खोजें...', 'ପ୍ରଡକ୍ଟ ଖୋଜନ୍ତୁ...'],
  ['Product', 'प्रोडक्ट', 'ପ୍ରଡକ୍ଟ'],
  ['Stock', 'स्टॉक', 'ଷ୍ଟକ୍'],
  ['Status', 'स्थिति', 'ସ୍ଥିତି'],
  ['Action', 'कार्य', 'କାର୍ଯ୍ୟ'],
  ['Edit', 'बदलें', 'ବଦଳାନ୍ତୁ'],
  ['Filter', 'फ़िल्टर', 'ଫିଲ୍ଟର୍'],
  ['Shop Management', 'दुकान प्रबंधन', 'ଦୋକାନ ପରିଚାଳନା'],
  ['Manage Your Shop', 'अपनी दुकान संभालें', 'ଆପଣଙ୍କ ଦୋକାନ ପରିଚାଳନା'],
  ['Update shop details, address, and information',
    'दुकान की जानकारी अपडेट करें',
    'ଦୋକାନ ବିବରଣୀ ଅପଡେଟ୍ କରନ୍ତୁ'],
  ['Business Hours', 'व्यापार समय', 'ବ୍ୟବସାୟ ସମୟ'],
  ['Set open hours and holidays',
    'खुलने का समय और छुट्टियाँ तय करें',
    'ଖୋଲା ସମୟ ଓ ଛୁଟି ଠିକ୍ କରନ୍ତୁ'],
  ['Delivery and Pickup', 'डिलीवरी और पिकअप', 'ଡେଲିଭରି ଓ ପିକଅପ୍'],
  ['Manage delivery zones and pickup options',
    'डिलीवरी ज़ोन और पिकअप विकल्प',
    'ଡେଲିଭରି ଜୋନ୍ ଓ ପିକଅପ୍ ବିକଳ୍ପ'],
  ['Payment and Bank Details', 'भुगतान और बैंक विवरण', 'ପେମେଣ୍ଟ ଓ ବ୍ୟାଙ୍କ ବିବରଣୀ'],
  ['Manage bank account and payout information',
    'बैंक खाता और पेआउट जानकारी',
    'ବ୍ୟାଙ୍କ ଖାତା ଓ ପେଆଉଟ୍ ସୂଚନା'],
  ['Products & Sales', 'प्रोडक्ट और बिक्री', 'ପ୍ରଡକ୍ଟ ଓ ବିକ୍ରି'],
  ['Support & Account', 'सपोर्ट और अकाउंट', 'ସହାୟତା ଓ ଆକାଉଣ୍ଟ'],
  ['Manage your product categories',
    'अपनी प्रोडक्ट श्रेणियाँ देखें',
    'ଆପଣଙ୍କ ପ୍ରଡକ୍ଟ ବର୍ଗ ଦେଖନ୍ତୁ'],
  ['Inventory', 'इन्वेंटरी', 'ଇନଭେଣ୍ଟୋରୀ'],
  ['Track stock and manage inventory', 'स्टॉक ट्रैक करें', 'ଷ୍ଟକ୍ ଟ୍ରାକ୍ କରନ୍ତୁ'],
  ['Deals and Offers', 'डील्स और ऑफ़र', 'ଡିଲ୍ ଓ ଅଫର୍'],
  ['Create and manage deals and discounts', 'डील और डिस्काउंट बनाएँ', 'ଡିଲ୍ ଓ ଛାଡ଼ ତିଆରି କରନ୍ତୁ'],
  ['Sales Report', 'बिक्री रिपोर्ट', 'ବିକ୍ରି ରିପୋର୍ଟ'],
  ['View sales performance and reports', 'बिक्री प्रदर्शन देखें', 'ବିକ୍ରି ପ୍ରଦର୍ଶନ ଦେଖନ୍ତୁ'],
  ['Customers Reviews', 'ग्राहक रिव्यू', 'ଗ୍ରାହକ ରିଭ୍ୟୁ'],
  ['View and respond to customer reviews', 'ग्राहक रिव्यू देखें', 'ଗ୍ରାହକ ରିଭ୍ୟୁ ଦେଖନ୍ତୁ'],
  ['Change app language', 'ऐप की भाषा बदलें', 'ଆପ୍ ଭାଷା ବଦଳାନ୍ତୁ'],
  ['Get help and support', 'मदद और सपोर्ट पाएँ', 'ସାହାଯ୍ୟ ପାଆନ୍ତୁ'],
  ['Notification', 'नोटिफ़िकेशन', 'ନୋଟିଫିକେସନ୍'],
  ['Manage your notification preferences', 'नोटिफ़िकेशन सेटिंग', 'ନୋଟିଫିକେସନ୍ ସେଟିଂ'],
  ['New order alert (vibration)', 'नए ऑर्डर पर वाइब्रेशन', 'ନୂଆ ଅର୍ଡରରେ ଭାଇବ୍ରେସନ୍'],
  ['Logout from your seller account', 'सेलर अकाउंट से लॉग आउट', 'ସେଲର୍ ଆକାଉଣ୍ଟରୁ ଲଗ୍ ଆଉଟ୍'],
  ['Coming soon', 'जल्द आ रहा है', 'ଶୀଘ୍ର ଆସୁଛି'],
  ['No reviews yet.', 'अभी कोई रिव्यू नहीं।', 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ରିଭ୍ୟୁ ନାହିଁ।'],
  ['Your neighbourhood, your marketplace.',
    'आपका मोहल्ला, आपका बाज़ार।',
    'ଆପଣଙ୍କ ପଡ଼ା, ଆପଣଙ୍କ ବଜାର।'],
  ['Loading...', 'लोड हो रहा है...', 'ଲୋଡ୍ ହେଉଛି...'],
  ['Please turn on GPS / Location services',
    'कृपया GPS / लोकेशन चालू करें',
    'ଦୟାକରି GPS / ଲୋକେସନ୍ ଚାଲୁ କରନ୍ତୁ'],
];
const TR = { en: { 'Sabzi-Phal': 'Vegetables & Fruits', 'Dudh-Dairy': 'Dairy & Milk',
  Sabzi: 'Vegetables', Phal: 'Fruits' }, hi: {}, or: {} };
D.forEach(([e, h, o]) => { TR.hi[e] = h; TR.or[e] = o; });
const TPL = {};
function tpls(l) {
  if (TPL[l]) return TPL[l];
  TPL[l] = Object.keys(TR[l]).filter((k) => /\{(0|1|n)\}/.test(k)).map((k) => {
    const re = '^' + k.split(/(\{0\}|\{1\}|\{n\})/).map((p) => (p === '{n}' ? '(\\d+)' : /^\{[01]\}$/.test(p) ? '(.+?)' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$';
    return [new RegExp(re), TR[l][k]];
  });
  return TPL[l];
}
function trs(v) {
  if (typeof v !== 'string') return v;
  const d = TR[LANG];
  if (!d) return v;
  const m = v.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2];
  if (!core) return v;
  if (d[core] !== undefined) return m[1] + d[core] + m[3];
  const t = tpls(LANG);
  for (let i = 0; i < t.length; i++) {
    const mm = core.match(t[i][0]);
    if (mm) return m[1] + t[i][1].replace(/\{0\}|\{n\}/g, () => mm[1]).replace(/\{1\}/g, () => mm[2]) + m[3];
  }
  return v;
}
const trc = (c) => (Array.isArray(c) ? c.map((x) => (typeof x === 'string' ? trs(x) : x)) : trs(c));
function Text({ children, ...p }) { return <RNText {...p}>{trc(children)}</RNText>; }
function TextInput({ placeholder, ...p }) { return <RNTextInput placeholder={trs(placeholder)} {...p} />; }

// ======================================================================
// SUPABASE (plain fetch, no extra package)
//  - network failures -> friendly error
//  - access token auto-refresh (before expiry and on 401), single-flight
//  - refresh failure -> session cleared + ON_EXPIRED callback
// ======================================================================
let SESSION = null;
let ON_EXPIRED = null;
let REFRESHING = null;

async function raw(path, opt, token) {
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  if (opt.prefer) h.Prefer = opt.prefer;
  let r;
  try {
    r = await fetch(URL_ + path, {
      method: opt.method || 'GET',
      headers: h,
      body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined,
    });
  } catch (e) {
    const ne = new Error('No internet connection. Please check your network and try again.');
    ne.network = true;
    throw ne;
  }
  let j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok) {
    const err = new Error((j && (j.message || j.msg || j.error_description || j.error)) || 'Error ' + r.status);
    err.status = r.status;
    err.code = j && j.code;
    err.details = j && j.details;
    throw err;
  }
  return j;
}
const expAt = (j) => (j && j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : (j && j.expires_at ? Number(j.expires_at) * 1000 : 0));

const PKCE_KEY = 'nearkart_password_reset_pkce_v1';
let PKCE_MEM = null;

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function newPkce() {
  if (!Cry) throw new Error('Secure password reset is unavailable. Please update the app.');
  const verifier = bytesToHex(Cry.getRandomBytes(32));
  const digest = await Cry.digestStringAsync(
    Cry.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Cry.CryptoEncoding.BASE64 }
  );
  const challenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return { v: verifier, c: challenge };
}

async function saveVerifier(verifier) {
  PKCE_MEM = verifier;
  if (!AS) throw new Error('Secure storage is unavailable. Please restart the app and try again.');
  await AS.setItem(PKCE_KEY, verifier);
  const check = await AS.getItem(PKCE_KEY);
  if (check !== verifier) throw new Error('Could not save password reset securely. Please try again.');
}

async function loadVerifier() {
  if (AS) {
    const saved = await AS.getItem(PKCE_KEY);
    if (saved) {
      PKCE_MEM = saved;
      return saved;
    }
  }
  return PKCE_MEM;
}

async function clearVerifier() {
  PKCE_MEM = null;
  if (AS) {
    try { await AS.removeItem(PKCE_KEY); } catch (e) {}
  }
}

async function requestPasswordReset(email) {
  if (!ExLink || !Cry) throw new Error('Password reset is unavailable. Please check the app setup.');
  const address = String(email || '').trim().toLowerCase();
  if (!address || !address.includes('@')) throw new Error('Please enter a valid email address.');

  const pkce = await newPkce();
  const previous = await loadVerifier();

  try {
    await saveVerifier(pkce.v);
    const redirect = ExLink.createURL('reset-password');
    await raw('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect), {
      method: 'POST',
      body: {
        email: address,
        code_challenge: pkce.c,
        code_challenge_method: 's256',
      },
    });
  } catch (e) {
    if (previous) {
      try { await saveVerifier(previous); } catch (ignored) {}
    } else {
      await clearVerifier();
    }
    throw e;
  }
}
function refreshSession() {
  if (!SESSION || !SESSION.refresh) return Promise.reject(new Error('Session expired. Please log in again.'));
  if (!REFRESHING) {
    const old = SESSION;
    REFRESHING = raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: old.refresh } })
      .then((j) => {
        SESSION = { ...(SESSION || old), token: j.access_token, refresh: j.refresh_token || old.refresh, expires_at: expAt(j) };
        store.set('session', JSON.stringify(SESSION));
        return SESSION;
      })
      .finally(() => { REFRESHING = null; });
  }
  return REFRESHING;
}
// true = refreshed, false = session is dead (cleared), throws only for network problems
async function tryRefresh() {
  try { await refreshSession(); return true; }
  catch (e) {
    if (e.network) throw e;
    SESSION = null; store.del('session');
    if (ON_EXPIRED) ON_EXPIRED();
    return false;
  }
}
async function api(path, opt = {}) {
  if (SESSION && SESSION.expires_at && Date.now() > SESSION.expires_at - 30000) {
    if (!(await tryRefresh())) throw new Error('Session expired. Please log in again.');
  }
  try {
    return await raw(path, opt, SESSION && SESSION.token);
  } catch (e) {
    if (SESSION && SESSION.refresh && (e.status === 401 || /jwt/i.test(e.message || ''))) {
      if (!(await tryRefresh())) throw new Error('Session expired. Please log in again.');
      return raw(path, opt, SESSION.token);
    }
    throw e;
  }
}
const rpc = (name, body) => api('/rest/v1/rpc/' + name, { method: 'POST', body: body || {} });
async function registerPushToken() {
  if (!Notif || !Dev || !Dev.isDevice || !SESSION || !SESSION.uid) return;

  if (Platform.OS === 'android') {
    await Notif.setNotificationChannelAsync('default', {
      name: 'NearKart Notifications',
      importance: Notif.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  let permission = await Notif.getPermissionsAsync();

  if (permission.status !== 'granted') {
    permission = await Notif.requestPermissionsAsync();
  }

  if (permission.status !== 'granted') return;

  const result = await Notif.getExpoPushTokenAsync({
    projectId: '3744b922-34e1-4087-841c-999a2d5549a2',
  });

  await rpc('register_push_token', {
    p_token: result.data,
    p_platform: Platform.OS,
    p_device_name: 'NearKart Android',
  });
}

// true when the database function / schema is simply not there
const isMissingFn = (e) => !!e && (e.status === 404 || e.code === 'PGRST202' ||
  /could not find the function|schema cache/i.test(String(e.message || '')));

// ---------- SHOPS: only through RPC functions (never REST on the shops table) ----------
// If your database already has differently named functions, change the names here.
const SHOP_RPC = {
  list: 'get_public_shops',     // ()                                   -> all public shops (json array)
  mine: 'get_my_shop',          // ()                                   -> the signed-in owner's shop (json)
  create: 'register_my_shop',   // (p_name, p_owner_name, p_phone, p_area, p_category, p_photo_url) -> shop (json)
  update: 'update_my_shop',     // (p_shop_id, p_is_open, p_offer, p_update_offer) -> shop (json)
};
async function shopRpc(kind, body) {
  try {
    return await rpc(SHOP_RPC[kind], body);
  } catch (e) {
    if (isMissingFn(e)) {
      const m = new Error('Database function "' + SHOP_RPC[kind] + '" is missing. Run shops_rpc_migration.sql in the Supabase SQL editor.');
      m.missingRpc = true;
      throw m;
    }
    throw e;
  }
}
// products no longer embed shops(name); the shop name is joined here from the shop list
function withShopNames(ps, shopList) {
  const m = {};
  (shopList || []).forEach((x) => { m[x.id] = x.name; });
  return (ps || []).map((p) => ({ ...p, shops: m[p.shop_id] !== undefined ? { name: m[p.shop_id] } : null }));
}

// ---------- PROFILES / SELLER ROLE ----------
// The role (buyer / seller) is ALWAYS read from the database row of the signed-in user.
async function fetchProfileRow(uid) {
  const cols = ['id', 'user_id'];
  for (let i = 0; i < cols.length; i++) {
    try {
      const r = await api('/rest/v1/profiles?' + cols[i] + '=eq.' + uid + '&select=*');
      if (r && r[0]) return r[0];
    } catch (e) { if (e.network) throw e; }
  }
  return null;
}
// Creates / updates the seller row in "profiles" with role = seller. Needs a real session.
// Never touches update_my_profile (that function writes role 'buyer').
async function ensureSellerProfile(uid, d) {
  const email = (d && d.email) || (SESSION && SESSION.email) || '';
  const fallbackName = String(email).split('@')[0] || 'Seller';
  const name = ((d && d.name) || '').trim();
  const phone = ((d && d.phone) || '').trim();
  const area = ((d && d.area) || '').trim();
  const address = ((d && d.address) || '').trim();
  try {
    await rpc('ensure_seller_profile', {
      p_name: name || fallbackName, p_phone: phone || null, p_area: area || null, p_address: address || null,
    });
    return;
  } catch (e) {
    if (!isMissingFn(e)) throw e;
  }
  // fallback (ensure_seller_profile SQL not installed): REST upsert of the user's own row
  const existing = await fetchProfileRow(uid);
  const row = { id: uid, role: 'seller' };
  if (name || !(existing && existing.name)) row.name = name || fallbackName;
  if (phone) row.phone = phone;
  if (area) row.area = area;
  if (address) row.address = address;
  try {
    await api('/rest/v1/profiles?on_conflict=id', {
      method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: row,
    });
  } catch (e) {
    if (e.network) throw e;
    if (e.code === '42501' || e.status === 401 || e.status === 403 || /row-level security|permission denied/i.test(String(e.message || ''))) {
      throw new Error('Seller profile could not be saved (database permission). Run the ensure_seller_profile SQL given at the top of App.js, then try again.');
    }
    throw e;
  }
}

// user friendly error text (database messages are still shown, never swallowed)
function errMsg(e) {
  if (!e) return 'Something went wrong';
  if (e.network) return e.message;
  const m = String(e.message || e);
  if (/invalid login credentials/i.test(m)) return 'Wrong email or password.';
  if (/already registered|already exists|user already/i.test(m)) return 'This email is already registered. Please log in.';
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first, then log in.';
  if (/rate limit|too many requests|security purposes/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  if (/password should be|weak password/i.test(m)) return m;
  if (/jwt|not authenticated|not logged in/i.test(m)) return 'Session expired. Please log in again.';
  if (/could not find the function .*(get_shop_payment|update_my_payment|submit_order_utr|get_order_payment|verify_order_payment)/i.test(m)) return 'Payment database functions are missing. Run the payment SQL given at the top of App.js in the Supabase SQL editor.';
  if (/insufficient|not enough stock|out of stock|stock/i.test(m) && !/version/i.test(m)) return m;
  if (e.code === '42501' || /permission denied|row-level security|not allowed|not authorized/i.test(m)) return 'You are not allowed to do this. (' + m + ')';
  return m;
}
const isConflict = (e) => !!e && (e.status === 409 || /version|conflict|stale|concurrent/i.test(String(e.message || '')));

// ORDER-only message: used ONLY where an order is placed (place_order). Never used for login / signup.
function orderErrMsg(e) {
  if (e && !e.network && (e.code === '23505' || /duplicate key|already (placed|submitted)/i.test(String(e.message || '')))) {
    return 'This order was already submitted. Please check My Orders.';
  }
  return errMsg(e);
}
// AUTH-only message: used ONLY by login / signup. A database "duplicate key" here is about the ACCOUNT, not an order.
function authErrMsg(e) {
  if (!e) return 'Something went wrong';
  if (e.network) return e.message;
  const m = String(e.message || e);
  if (e.code === '23505' || /duplicate key|unique constraint/i.test(m)) {
    return 'This account already exists (or its profile already exists). Please log in. If login fails, ask the admin to check the profile trigger in Supabase. (' + m + ')';
  }
  if (/database error saving new user/i.test(m)) {
    return 'Account could not be created because of a database setup problem (Supabase trigger on new users). Details: ' + m;
  }
  return errMsg(e);
}

// ======================================================================
// HELPERS
// ======================================================================
const num = (n) => String(Math.round(n * 1000) / 1000);
const money = (n) => '₹' + (Math.round(n * 100) / 100);
const isMeasure = (u) => u === 'kg' || u === 'litre';
function qtyLabel(q, u) {
  if (u === 'kg') return q < 1 ? Math.round(q * 1000) + ' g' : num(q) + ' kg';
  if (u === 'litre') return q < 1 ? Math.round(q * 1000) + ' ml' : num(q) + ' L';
  return num(q) + (u === 'pack' ? ' pack' : ' pc');
}
const unitLabel = (u) => (u === 'litre' ? 'L' : u === 'piece' ? 'pc' : u);
const shortId = (id) => '#NK' + String(id).replace(/-/g, '').slice(-4).toUpperCase();
const orderNo = (o) => (o && o.order_number ? '#' + o.order_number : shortId(o.id));
const minsLeft = (t) => Math.max(0, 10 - Math.floor((Date.now() - new Date(t).getTime()) / 60000));
const catMeta = (k) => CATS.find((c) => c.k === k) || { ic: '🏪', bg: '#e3ecff' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function hm(d) {
  let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap;
}
const dayLabel = (d) => (d.toDateString() === new Date().toDateString() ? 'Today' : d.getDate() + ' ' + MON[d.getMonth()]);
const when = (t) => { const d = new Date(t); return dayLabel(d) + ', ' + hm(d); };
function estWindow(t) {
  const a = new Date(new Date(t).getTime() + 60 * 60000), b = new Date(new Date(t).getTime() + 120 * 60000);
  return dayLabel(a) + ', ' + hm(a) + ' - ' + hm(b);
}
const callPhone = (p) => { if (p) Linking.openURL('tel:' + p).catch(() => {}); };
const openMap = (a) => { if (a) Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a)).catch(() => {}); };

// ---------- UPI helpers ----------
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const isUtr = (v) => /^\d{12}$/.test(String(v || '').trim());
const isPaid = (st) => /^(verified|paid|confirmed|success)/i.test(String(st || ''));
const isRejectedPay = (st) => /^(rejected|failed|not_received)/i.test(String(st || ''));
function openUpi(upi, name, amount) {
  const link = 'upi://pay?pa=' + upi + '&pn=' + encodeURIComponent(name || 'NearKart Shop') +
    '&am=' + Number(amount).toFixed(2) + '&cu=INR';
  Linking.openURL(link).catch(() => {
    Alert.alert('UPI', 'No UPI app was found on this phone. Please scan the QR code or pay to the UPI ID manually.');
  });
}

// RPC result helpers (RPCs may return an array, or an object wrapping the array)
function unwrapList(r) {
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') {
    if (Array.isArray(r.orders)) return r.orders;
    if (Array.isArray(r.products)) return r.products;
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r.items)) return r.items;
    if (Array.isArray(r.rows)) return r.rows;
  }
  return [];
}
// database order row -> shape used by the UI
function normOrder(o) {
  const raw0 = o.order_items || o.items || [];
  const items = (Array.isArray(raw0) ? raw0 : []).map((i, n) => ({ ...i, id: i.id !== undefined && i.id !== null ? i.id : String(i.product_id || 'x') + '-' + n }));
  const shops = o.shops || (o.shop_name || o.shop_phone ? { name: o.shop_name || '', phone: o.shop_phone || '' } : null);
  return {
    ...o,
    status: stUI(o.status),
    order_items: items,
    shops,
    customer_name: o.customer_name || o.name || '',
    phone: o.customer_phone || o.phone || '',
    address: o.customer_address || o.address || '',
    total: Number(o.total_amount ?? o.total ?? 0),
    pickup: /pick/i.test(String(o.delivery_type || '')),
    pay: /upi/i.test(String(o.payment_method || '')) ? 'upi' : 'cod',
  };
}
const payText = (o) => (o.pay === 'upi'
  ? 'UPI · ' + (o.payment_status ? String(o.payment_status).replace(/_/g, ' ') : 'pending shop verification')
  : 'Cash on Delivery');

// UTR number + payment status of one UPI order (loaded with get_order_payment, falls back to the order row)
function useOrderPay(o) {
  const [info, setInfo] = useState(null);
  const [tick, setTick] = useState(0);
  const oid = o ? o.id : null;
  const isUpi = !!(o && o.pay === 'upi');
  useEffect(() => {
    if (!isUpi || !oid) { setInfo(null); return undefined; }
    let dead = false;
    rpc('get_order_payment', { p_order: oid })
      .then((r) => {
        const x = Array.isArray(r) ? r[0] : r;
        if (!dead && x && typeof x === 'object') setInfo(x);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [oid, isUpi, tick, o ? o.payment_status : '']);
  const utr = (info && info.utr_number) || (o && o.utr_number) || '';
  const status = (info && info.payment_status) || (o && o.payment_status) || '';
  return [{ utr: String(utr || ''), status: String(status || '') }, () => setTick((t) => t + 1)];
}

// ======================================================================
// SEARCH: English / Hindi / Odia names and common transliterations
// (used only for search + suggestions - sellers can add ANY product)
// ======================================================================
const ALIASES = [
  ['onion', 'piyaj', 'piaj', 'pyaz', 'pyaaz', 'pyaj', 'pyaja', 'kanda', 'प्याज', 'पियाज', 'ପିଆଜ'],
  ['potato', 'aloo', 'alu', 'aaloo', 'batata', 'आलू', 'ଆଳୁ'],
  ['tomato', 'tamatar', 'tomatar', 'tamata', 'टमाटर', 'ଟମାଟୋ', 'ଟମାଟର'],
  ['milk', 'dudh', 'doodh', 'dood', 'दूध', 'ଦୁଧ'],
  ['rice', 'chawal', 'chaul', 'chaula', 'चावल', 'ଚାଉଳ'],
  ['atta', 'aata', 'wheat flour', 'gehu', 'gehun', 'आटा', 'गेहूं', 'ଆଟା'],
  ['dal', 'daal', 'dhal', 'lentil', 'dali', 'दाल', 'ଡାଲି'],
  ['oil', 'tel', 'tail', 'तेल', 'ତେଲ'],
  ['ghee', 'ghi', 'घी', 'ଘିଅ'],
  ['sugar', 'chini', 'cheeni', 'shakkar', 'चीनी', 'शक्कर', 'ଚିନି'],
  ['salt', 'namak', 'nun', 'नमक', 'ଲୁଣ'],
  ['banana', 'kela', 'kadali', 'केला', 'କଦଳୀ'],
  ['apple', 'seb', 'seu', 'सेब', 'ସେଉ'],
  ['mango', 'aam', 'amba', 'आम', 'ଆମ୍ବ'],
  ['egg', 'anda', 'ande', 'anda', 'अंडा', 'ଅଣ୍ଡା'],
  ['bread', 'pav', 'ब्रेड', 'पाव'],
  ['paneer', 'cottage cheese', 'पनीर', 'ପନୀର'],
  ['curd', 'dahi', 'dahee', 'yogurt', 'दही', 'ଦହି'],
  ['tea', 'chai', 'chay', 'चाय', 'ଚା'],
  ['soap', 'sabun', 'sabon', 'साबुन', 'ସାବୁନ'],
  ['chilli', 'mirch', 'mirchi', 'lanka', 'मिर्च', 'ଲଙ୍କା'],
  ['garlic', 'lahsun', 'lasun', 'rasun', 'लहसुन', 'ରସୁଣ'],
  ['ginger', 'adrak', 'ada', 'अदरक', 'ଅଦା'],
  ['cauliflower', 'phulkopi', 'phoolgobhi', 'gobi', 'फूलगोभी', 'ଫୁଲକୋବି'],
  ['cabbage', 'patta gobi', 'bandhakopi', 'पत्तागोभी', 'ବନ୍ଧାକୋବି'],
  ['brinjal', 'baingan', 'begun', 'eggplant', 'बैंगन', 'ବାଇଗଣ'],
  ['okra', 'bhindi', 'ladyfinger', 'भिंडी', 'ଭେଣ୍ଡି'],
  ['peas', 'matar', 'मटर', 'ମଟର'],
  ['lemon', 'nimbu', 'nibu', 'नींबू', 'ଲେମ୍ବୁ'],
  ['coriander', 'dhania', 'dhaniya', 'धनिया', 'ଧନିଆ'],
  ['biscuit', 'biskut', 'biscuits', 'बिस्किट'],
  ['vegetables', 'sabzi', 'sabji', 'sabzee', 'सब्ज़ी', 'सब्जी', 'ପନିପରିବା'],
  ['fruits', 'phal', 'fal', 'फल', 'ଫଳ'],
  ['grocery', 'kirana', 'किराना', 'ମୁଦିଖାନା'],
  ['medicine', 'dawai', 'dawa', 'दवा', 'ଔଷଧ'],
];
function termsFor(tok) {
  const ql = String(tok || '').trim().toLowerCase();
  if (!ql) return [];
  const set = {};
  set[ql] = 1;
  ALIASES.forEach((g) => {
    const hit = g.some((a) => a === ql || (ql.length >= 3 && a.length > ql.length && a.indexOf(ql) === 0));
    if (hit) g.forEach((a) => { set[a] = 1; });
  });
  return Object.keys(set);
}
// every word of the query must match the text (directly or through an alias)
function matchText(text, q) {
  const t = String(text || '').toLowerCase();
  const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  return toks.every((tk) => termsFor(tk).some((x) => t.indexOf(x) >= 0));
}
function dedupeById(list) {
  const seen = {};
  return list.filter((p) => { if (!p || seen[p.id]) return false; seen[p.id] = 1; return true; });
}
const inStock = (p) => Number(p.online_qty) > 0;

// ======================================================================
// SMALL UI PARTS
// ======================================================================
function Btn({ t, onPress, kind, disabled, small, style }) {
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.8}
      style={[s.btn, small && s.btnS, kind === 'o' && s.btnO,
        kind === 'g' && { backgroundColor: GREEN }, kind === 'r' && s.btnR,
        kind === 'x' && { backgroundColor: '#cfd6e4' }, disabled && { opacity: 0.5 }, style]}
    >
      <Text
        style={[s.btnT, kind === 'o' && { color: BLUE }, kind === 'r' && { color: RED },
          kind === 'x' && { color: MUTE }]}>{t}</Text>
    </TouchableOpacity>
  );
}
function Field({ label, ...p }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#9aa3b2" autoCapitalize="none" {...p} />
    </View>
  );
}
function Chip({ t, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipT, on && { color: '#fff' }]}>{t}</Text>
    </TouchableOpacity>
  );
}
function Tag({ t, kind, sm }) {
  const c = { g: ['#dcf5e1', '#0a6b3f'], y: ['#fff0c4', '#8a5a00'], r: ['#fbe0db', '#9a2314'],
    b: ['#e3ecff', BLUE] }[kind || 'g'];
  return <Text style={[s.tag, sm && s.tagS, { backgroundColor: c[0], color: c[1] }]}>{t}</Text>;
}
function Msg({ t, ok }) {
  if (!t) return null;
  return (
    <View style={[s.msg, { backgroundColor: ok ? '#e1f5e6' : '#fbe0db' }]}>
      <Text style={{ color: ok ? '#1c6b34' : '#a52a1a' }}>{t}</Text>
    </View>
  );
}
function Photo({ url, name, size = 56, round }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [url]);
  const st = { width: size, height: size, borderRadius: round ? size / 2 : 14,
    backgroundColor: '#dbe6fb', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' };
  if (url && !bad) return <Image source={{ uri: url }} style={st} onError={() => setBad(true)} />;
  return (
    <View style={st}>
      <RNText
        style={{ color: BLUE, fontWeight: '800', fontSize: size / 2.4 }}>{(name || '?')[0].toUpperCase()}</RNText>
    </View>
  );
}
// QR code picture (data: URI or http link)
function QrImage({ url, size = 200 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => { setBad(false); }, [url]);
  if (!url || bad) {
    return (
      <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: '#eef3ff',
        alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={s.sub}>QR not available</RNText>
      </View>
    );
  }
  return (
    <Image source={{ uri: url }} resizeMode="contain" onError={() => setBad(true)}
      style={{ width: size, height: size, borderRadius: 14, backgroundColor: '#fff' }} />
  );
}
function Head({ title, sub, onBack, right }) {
  return (
    <View style={s.head}>
      <View style={s.rowB}>
        {onBack ? (
          <TouchableOpacity onPress={onBack}>
            <Text style={{ color: '#cfdcf7', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
        ) : <View />}
        {right}
      </View>
      <Text style={s.headT}>{title}</Text>
      {!!sub && <Text style={{ color: '#cfdcf7', marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}
function Logo({ size = 24 }) {
  return (
    <RNText style={{ color: '#fff', fontSize: size, fontWeight: '800' }}>Near<RNText
      style={{ color: LIME }}>Kart</RNText>
    </RNText>
  );
}
function MenuRow({ ic, bg, title, sub, onPress, danger, last }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.mrow, !last && s.mrowLine]}>
      <View style={[s.mic, { backgroundColor: bg || '#e8f0ff' }]}>
        <RNText style={{ fontSize: 20 }}>{ic}</RNText>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.shopN, danger && { color: RED }]}>{title}</Text>
        {!!sub && <Text style={s.sub} numberOfLines={2}>{sub}</Text>}
      </View>
      <RNText style={{ color: danger ? RED : '#9aa3b2', fontSize: 22 }}>›</RNText>
    </TouchableOpacity>
  );
}
// square tile used by the new Profile / More pages
function ProfTile({ ic, bg, title, sub, onPress, danger }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={{ width: '48%', backgroundColor: '#fff', borderRadius: 18, padding: 14, marginBottom: 12,
        borderWidth: 1, borderColor: danger ? '#f6c4d0' : LINE }}>
      <View style={[s.mic, { backgroundColor: bg, width: 46, height: 46, borderRadius: 14 }]}>
        <RNText style={{ fontSize: 22 }}>{ic}</RNText>
      </View>
      <Text style={[s.shopN, { marginTop: 10, fontSize: 15 }, danger && { color: RED }]} numberOfLines={1}>{title}</Text>
      <Text style={s.sub} numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}
function Sheet({ onClose, children }) {
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.overlay}>
          <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
          <View style={s.sheet}><View style={s.grab} />{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function LangScreen({ onPick, current, onClose }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK, justifyContent: 'center', padding: 24 }}>
      <StatusBar barStyle="light-content" />
      <View style={{ alignItems: 'center' }}><Logo size={34} /></View>
      <RNText
        style={{ color: '#cfdcf7', textAlign: 'center', marginTop: 24, marginBottom: 18, fontSize: 16,
          lineHeight: 24 }}>Choose your language{'\n'}अपनी भाषा चुनें{'\n'}ଆପଣଙ୍କ ଭାଷା ବାଛନ୍ତୁ</RNText>
      {LANGS.map(([k, n]) => (
        <TouchableOpacity key={k} onPress={() => onPick(k)}
          style={{ backgroundColor: current === k ? LIME : '#fff', borderRadius: 16, padding: 18,
            marginBottom: 12, alignItems: 'center' }}>
          <RNText style={{ fontSize: 20, fontWeight: '800', color: INK }}>{n}</RNText>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', padding: 12 }}>
        <RNText style={{ color: '#cfdcf7', fontSize: 18 }}>✕</RNText>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
function LocSheet({ loc, onClose, onSave }) {
  const [area, setArea] = useState(loc && loc.area ? loc.area : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const detect = async () => {
    setBusy(true); setMsg('');
    try { onSave(await detectArea()); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      <Text style={s.h}>Select your location</Text>
      <Btn t={busy ? 'Please wait...' : 'Use my current location'} onPress={detect} disabled={busy} />
      <Msg t={msg} />
      <View style={{ height: 14 }} />
      <Field label="Village / Area" value={area} onChangeText={setArea} autoCapitalize="words" />
      <Btn kind="o" t="Save" onPress={() => { if (area.trim()) onSave({ area: area.trim(), full: '' }); }} />
    </Sheet>
  );
}

// Soft green -> blue gradient (no extra package needed)
function GradientBox({ children, style }) {
  const A = [168, 230, 176], B = [158, 206, 232];
  const N = 20;
  const strips = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const c = A.map((v, k) => Math.round(v + (B[k] - v) * f));
    strips.push(<View key={i} style={{ flex: 1, backgroundColor: 'rgb(' + c.join(',') + ')' }} />);
  }
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>{strips}</View>
      {children}
    </View>
  );
}

// ======================================================================
// SPLASH SCREEN (matches the NearKart design)
// ======================================================================
function Splash() {
  const SKY = '#eaf3ff';
  return (
    <View style={{ flex: 1, backgroundColor: SKY, alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden' }}>
      <StatusBar barStyle="dark-content" backgroundColor={SKY} />

      {/* top-left blue / green corner */}
      <View style={{ position: 'absolute', top: -120, left: -150, width: 420, height: 230,
        backgroundColor: DARK, transform: [{ rotate: '-30deg' }] }} />
      <View style={{ position: 'absolute', top: -92, left: -120, width: 460, height: 12,
        backgroundColor: '#4caf50', transform: [{ rotate: '-30deg' }] }} />
      {/* bottom-right blue / green corner */}
      <View style={{ position: 'absolute', bottom: -120, right: -150, width: 420, height: 230,
        backgroundColor: DARK, transform: [{ rotate: '-30deg' }] }} />
      <View style={{ position: 'absolute', bottom: -92, right: -120, width: 460, height: 12,
        backgroundColor: '#4caf50', transform: [{ rotate: '-30deg' }] }} />

      {/* logo */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 44, height: 34, borderWidth: 7, borderColor: '#2f6fc9', borderBottomWidth: 0,
            borderTopLeftRadius: 22, borderTopRightRadius: 22, marginBottom: -12 }} />
          <View style={{ width: 96, height: 104, borderRadius: 16, backgroundColor: '#2f6fc9',
            borderWidth: 4, borderColor: '#9fc2f2', alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ color: '#fff', fontSize: 62, fontWeight: '900' }}>N</RNText>
          </View>
        </View>
        <RNText style={{ fontSize: 44, marginLeft: -6, marginBottom: -4 }}>🛒</RNText>
      </View>
      <RNText style={{ fontSize: 54, fontWeight: '900', color: '#0a3a99', marginTop: 14 }}>Near<RNText
        style={{ color: '#3aa83f' }}>Kart</RNText>
      </RNText>
      <RNText style={{ fontSize: 17, fontWeight: '600', color: '#0a3a99', marginTop: 4 }}>Your neighbourhood, your marketplace.</RNText>

      <View style={{ alignItems: 'center', marginTop: 70 }}>
        <ActivityIndicator size="large" color={BLUE} />
        <RNText style={{ color: '#0a3a99', fontSize: 17, fontWeight: '600', marginTop: 14 }}>Loading...</RNText>
      </View>
    </View>
  );
}

// ======================================================================
// AUTH (buyer login from Profile / Orders / Place order, seller login from business card)
// FIX: never shows a false success. If email confirmation is ON, the user is told to confirm
// the email first (no fake login). "Already registered" is detected even when Supabase hides it.
// ======================================================================
function AuthBox({ role, onSession, onForgot}) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [good, setGood] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!email.includes('@') || pw.length < 6) { setGood(false); setMsg('Enter a valid email and a password of 6+ characters'); return; }
    setBusy(true); setMsg(''); setGood(false);
    try {
      const signup = mode !== 'login';
      const body = { email: email.trim(), password: pw };
      if (signup) body.data = { role: role === 'seller' ? 'seller' : 'buyer' };
      const j = await raw(signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password',
        { method: 'POST', body });
      if (j && j.access_token && j.user && j.user.id) {
        // real session (login, or signup with email confirmation turned OFF)
        const meta = j.user.user_metadata || {};
        await onSession({ token: j.access_token, refresh: j.refresh_token, uid: j.user.id,
          email: j.user.email || email.trim(), expires_at: expAt(j), meta_role: meta.role, isNew: signup });
      } else if (signup && j && (j.user || j.id)) {
        // signup worked but there is no session -> email confirmation is required
        const u = j.user || j;
        if (Array.isArray(u.identities) && u.identities.length === 0) {
          setGood(false); setMsg('This email is already registered. Please log in.'); setMode('login');
        } else {
          setGood(true);
          setMsg('Account created. Please confirm your email (check your inbox / spam), then log in.');
          setMode('login');
        }
      } else {
        setGood(false);
        setMsg(signup ? 'Account could not be created. Please try again.' : 'Login failed. Please try again.');
      }
    } catch (e) { setGood(false); setMsg(authErrMsg(e)); }
    setBusy(false);
  };
  return (
    <View style={s.card}>
      <Text style={s.h}>{mode === 'login' ? 'Login' : 'Create a new account'}</Text>
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Field label="Password (6+ characters)" value={pw} onChangeText={setPw} secureTextEntry />
      <TouchableOpacity
  onPress={onForgot}
  style={{ alignSelf: 'flex-end', paddingVertical: 10 }}
>
  <Text style={{ color: BLUE, fontWeight: '700' }}>
    Forgot Password?
  </Text>
</TouchableOpacity>
      <Msg t={msg} ok={good} />
      <View style={{ height: 6 }} />
      <Btn t={busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'} onPress={submit} disabled={busy}
        style={{ minHeight: 50 }} />
      <View style={{ height: 8 }} />
      <Btn kind="o" t={mode === 'login' ? 'Create a new account' : 'Already have an account? Log in'} onPress={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(''); setGood(false); }} />
      <Text
        style={[s.sub, { marginTop: 10 }]}>Email login is for testing. Phone OTP will come at launch.</Text>
    </View>
  );
}

function ForgotBox({ onBack }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [good, setGood] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim().includes('@')) {
      setGood(false);
      setMsg('Please enter a valid email address.');
      return;
    }

    setBusy(true);
    setMsg('');
    setGood(false);

    try {
      await requestPasswordReset(email);
      setGood(true);
      setMsg('If an account exists for this email, a password reset link will be sent. Please check your inbox and spam folder.');
    } catch (e) {
      setGood(false);
      setMsg(authErrMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.h}>Forgot Password?</Text>
      <Text style={s.sub}>
        Enter your registered email address. We will send you a password reset link.
      </Text>

      <View style={{ height: 14 }} />

      <Field
        label="Registered Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />

      <Msg t={msg} ok={good} />

      <View style={{ height: 8 }} />

      <Btn
        t={busy ? 'Sending...' : 'Send Reset Link'}
        onPress={submit}
        disabled={busy}
        style={{ minHeight: 50 }}
      />

      <View style={{ height: 8 }} />

      <Btn kind="o" t="Back to Login" onPress={onBack} />
    </View>
  );
}

function ResetPassword({ recovery, onDone }) {
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [good, setGood] = useState(false);

  const submit = async () => {
    if (busy) return;

    if (pw.length < 6) {
      setGood(false);
      setMsg('Password must be at least 6 characters.');
      return;
    }

    if (pw !== confirmPw) {
      setGood(false);
      setMsg('Passwords do not match.');
      return;
    }

    if (!recovery || !recovery.access_token) {
      setGood(false);
      setMsg('Your reset session is invalid. Please request a new reset link.');
      return;
    }

    setBusy(true);
    setMsg('');
    setGood(false);

    try {
      await raw('/auth/v1/user', {
        method: 'PUT',
        body: { password: pw },
      }, recovery.access_token);

      setGood(true);
      setMsg('Your password has been updated successfully.');

      setTimeout(() => {
        if (onDone) onDone();
      }, 1200);
    } catch (e) {
      setGood(false);
      setMsg(authErrMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: BG }}
      contentContainerStyle={{ padding: 14, flexGrow: 1, justifyContent: 'center' }}
    >
      <View style={s.card}>
        <Text style={s.h}>Create New Password</Text>
        <Text style={s.sub}>
          Choose a new password for your NearKart account.
        </Text>

        <View style={{ height: 14 }} />

        <Field
          label="New Password (6+ characters)"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
        />

        <Field
          label="Confirm New Password"
          value={confirmPw}
          onChangeText={setConfirmPw}
          secureTextEntry
        />

        <Msg t={msg} ok={good} />

        <View style={{ height: 8 }} />

        <Btn
          t={busy ? 'Updating...' : 'Update Password'}
          onPress={submit}
          disabled={busy}
          style={{ minHeight: 50 }}
        />
      </View>
    </ScrollView>
  );
}
function AuthScreen({ role, onSession, onClose, initialForgot }) {

  const seller = role === 'seller';
  const [forgot, setForgot] = useState(!!initialForgot);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 30 }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: '#cfdcf7', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 18 }}><Logo size={30} /></View>
        <Text style={[s.headT, { marginTop: 14 }]}>{seller ? 'Become a NearKart Partner' : 'Welcome to NearKart'}</Text>
        <Text style={{ color: '#cfdcf7', marginTop: 4 }}>{seller ? 'Sell your products online and reach shoppers near you' : 'Login or sign up to continue'}</Text>
      </View>
    {forgot ? (
  <ForgotBox onBack={() => setForgot(false)} />
) : (
  <AuthBox
  role={role}
  onSession={onSession}
  onForgot={() => setForgot(true)}
/>
)}  
      <View style={{ padding: 14 }}><Btn kind="o" t="Continue browsing" onPress={onClose} /></View>
    </ScrollView>
  );
}

// ======================================================================
// BUYER: HOME
// ======================================================================
function ShopCard({ x, onPress }) {
  return (
    <TouchableOpacity style={s.shopCard} onPress={() => onPress(x)} activeOpacity={0.85}>
      <Photo url={x.photo_url} name={x.name} size={78} />
      <View style={{ flex: 1 }}>
        <RNText style={s.shopN} numberOfLines={1}>{x.name}</RNText>
        <Text style={s.sub} numberOfLines={1}>{x.category} · {x.area}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Tag t={x.is_open ? '● Open' : '● Closed'} kind={x.is_open ? 'g' : 'r'} />
          <Text style={s.sub}>{x.rating > 0 ? '★ ' + x.rating : 'New'}</Text>
        </View>
        {!!x.offer && <RNText style={s.offer} numberOfLines={1}>🎁 {x.offer}</RNText>}
      </View>
      <RNText style={{ color: '#9aa3b2', fontSize: 22 }}>›</RNText>
    </TouchableOpacity>
  );
}
function ShopMini({ x, onPress }) {
  return (
    <TouchableOpacity style={s.mini} onPress={() => onPress(x)} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Photo url={x.photo_url} name={x.name} size={52} />
        <View style={{ flex: 1 }}>
          <RNText style={s.miniN} numberOfLines={1}>{x.name}</RNText>
          <Text style={s.sub} numberOfLines={1}>{catMeta(x.category).ic} {x.category}</Text>
        </View>
      </View>
      <View style={[s.rowB, { marginTop: 8 }]}>
        <Tag t={x.is_open ? '● Open' : '● Closed'} kind={x.is_open ? 'g' : 'r'} />
        <View style={s.arrow}><RNText style={{ color: BLUE, fontWeight: '800' }}>›</RNText></View>
      </View>
    </TouchableOpacity>
  );
}
function ProductTile({ p, onProduct }) {
  const out = Number(p.online_qty) <= 0;
  return (
    <TouchableOpacity style={s.pcard} onPress={() => onProduct(p)} activeOpacity={0.85}>
      <Photo url={p.image_url} name={p.name} size={96} />
      <RNText style={[s.shopN, { marginTop: 8, fontSize: 14 }]} numberOfLines={1}>{p.name}</RNText>
      <RNText style={s.sub} numberOfLines={1}>{p.shops ? p.shops.name : ''}</RNText>
      <View style={[s.rowB, { marginTop: 6 }]}>
        <RNText style={s.price}>{money(p.price)}<RNText style={s.sub}>/{unitLabel(p.unit)}</RNText>
        </RNText>
        {out && <Tag t="Out of stock" kind="r" sm />}
      </View>
    </TouchableOpacity>
  );
}

function Home({ shops, products, loading, err, loc, onLoc, onShop, onProduct, onReload, onMenu, onBell,
  onProfile, onCats, onCat }) {
  const [q, setQ] = useState('');
  const [bi, setBi] = useState(0);
  const [fOpen, setFOpen] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [fcat, setFcat] = useState(null);
  const [allShops, setAllShops] = useState(false);
  const [sp, setSp] = useState([]); // extra products found on the server for the search text
  const shopsRef = useRef(shops);
  shopsRef.current = shops;
  const offers = shops.filter((x) => x.offer);
  const slides = [{ t1: 'Great deals', t2: 'near you', d: 'Discover offers from local shops' },
    ...offers.slice(0, 4).map((x) => ({ t1: x.name, t2: x.offer, d: x.area, shop: x }))];
  useEffect(() => {
    const t = setInterval(() => setBi((i) => (i + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides.length]);
  const cur = bi % slides.length;
  const sl = slides[cur];
  const ql = q.trim().toLowerCase();

  // server side search (so products beyond the first 60 are found too), with aliases
  useEffect(() => {
    if (ql.length < 2) { setSp([]); return undefined; }
    let dead = false;
    const t = setTimeout(async () => {
      try {
        const first = ql.split(/\s+/)[0];
        const terms = termsFor(first).map((x) => x.replace(/[,()*%]/g, '')).filter((x) => x.length >= 2).slice(0, 10);
        if (!terms.length) return;
        const or = terms.map((x) => 'name.ilike.*' + encodeURIComponent(x) + '*').join(',');
        const r = await api('/rest/v1/products?active=eq.true&select=*&limit=40&or=(' + or + ')');
        if (!dead && Array.isArray(r)) setSp(withShopNames(r, shopsRef.current));
      } catch (e) { /* local results are still shown */ }
    }, 350);
    return () => { dead = true; clearTimeout(t); };
  }, [ql]);

  const filtering = !!ql || onlyOpen || !!fcat;
  const fShops = shops.filter((x) =>
    (!ql || matchText(x.name + ' ' + x.category + ' ' + x.area, ql)) &&
    (!onlyOpen || x.is_open) && (!fcat || x.category === fcat));
  const pText = (p) => (p.name || '') + ' ' + (p.category || '');
  const fProds = ql
    ? dedupeById([...products.filter((p) => matchText(pText(p), ql)), ...sp.filter((p) => matchText(pText(p), ql))])
    : products;
  const shownProds = ql ? fProds : fProds.slice(0, 12);
  // if every match is out of stock, suggest related products that ARE available
  let alts = [];
  if (ql && fProds.length > 0 && !fProds.some(inStock)) {
    const cs = {};
    fProds.forEach((p) => { if (p.category && p.category !== 'Other') cs[p.category] = 1; });
    alts = dedupeById([...products, ...sp])
      .filter((p) => inStock(p) && cs[p.category] && !fProds.some((m) => m.id === p.id)).slice(0, 6);
  }
  const mCats = ql ? CATS.filter((c) => matchText(c.k, ql)) : [];
  const shownShops = filtering || allShops ? fShops : fShops.slice(0, 4);
  const noShops = !loading && !err && fShops.length === 0;
  const noAny = ql ? noShops && fProds.length === 0 && mCats.length === 0 : noShops;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={onReload} />} keyboardShouldPersistTaps="handled">
      <View style={[s.head, { paddingBottom: 22 }]}>
        <View style={s.rowB}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={onMenu}>
              <RNText style={{ fontSize: 28, color: '#fff' }}>☰</RNText>
            </TouchableOpacity>
            <Logo />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity onPress={onBell}><RNText style={{ fontSize: 24 }}>🔔</RNText></TouchableOpacity>
            <TouchableOpacity onPress={onProfile} style={s.avatarS}>
              <RNText style={{ fontSize: 20 }}>👤</RNText>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={s.hello}>Hello, <Text style={{ color: LIME }}>Shopper!</Text> 👋</Text>
        <TouchableOpacity onPress={onLoc}
          style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <RNText>📍</RNText>
          <Text style={{ color: '#cfdcf7' }}>Delivering to</Text>
          <RNText
            style={{ color: '#fff', fontWeight: '800', flexShrink: 1 }} numberOfLines={1}>• {loc && loc.area ? loc.area : trs('Select your location')} ⌄</RNText>
        </TouchableOpacity>
        <View style={s.searchRow}>
          <RNText style={{ fontSize: 16 }}>🔍</RNText>
          <TextInput
            style={s.searchIn} placeholder="Search products, shops, and categories" placeholderTextColor="#8a93a6" value={q} onChangeText={setQ} />
          <View style={{ width: 1, height: 22, backgroundColor: LINE }} />
          <TouchableOpacity onPress={() => setFOpen(!fOpen)} style={{ paddingLeft: 4 }}>
            <RNText style={{ fontSize: 18, color: fOpen || onlyOpen || fcat ? BLUE : MUTE }}>⚙︎</RNText>
          </TouchableOpacity>
        </View>
      </View>

      {fOpen && (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip t="Open now" on={onlyOpen} onPress={() => setOnlyOpen(!onlyOpen)} />
            <Chip t="All" on={!fcat} onPress={() => setFcat(null)} />
            {CATS.map((c) => <Chip key={c.k} t={c.k} on={fcat === c.k} onPress={() => setFcat(fcat === c.k ? null : c.k)} />)}
          </View>
        </View>
      )}

      {mCats.length > 0 && (
        <View style={s.card}>
          <Text style={s.h}>Categories</Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{mCats.map((c) => <Chip key={c.k} t={c.ic + ' ' + c.k} onPress={() => onCat(c.k)} />)}</View>
        </View>
      )}

      {!filtering && (
        <View style={s.card}>
          <View style={s.rowB}>
            <Text style={s.h}>Explore Categories</Text>
            <TouchableOpacity onPress={onCats}>
              <Text style={s.link}>View All →</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {[...CATS.slice(0, 7), { k: 'More', ic: '•••', bg: '#e8f0ff' }].map((c) => (
              <TouchableOpacity key={c.k}
                style={[s.tile, { backgroundColor: c.bg }]} onPress={() => (c.k === 'More' ? onCats() : onCat(c.k))}>
                <RNText
                  style={{ fontSize: c.k === 'More' ? 22 : 30, color: BLUE, fontWeight: '800' }}>{c.ic}</RNText>
                <Text style={s.tileT} numberOfLines={1}>{c.k}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {!filtering && (
        <TouchableOpacity activeOpacity={sl.shop ? 0.8 : 1} onPress={() => sl.shop && onShop(sl.shop)}
          style={s.banner}>
          <View style={{ flex: 1 }}>
            <RNText
              style={{ fontSize: 24, fontWeight: '800', color: INK }} numberOfLines={1}>{sl.shop ? sl.t1 : trs(sl.t1)}</RNText>
            <RNText
              style={{ fontSize: 24, fontWeight: '800', color: GREEN }} numberOfLines={1}>{sl.shop ? sl.t2 : trs(sl.t2)}</RNText>
            <RNText
              style={{ color: MUTE, marginTop: 4 }} numberOfLines={1}>{sl.shop ? sl.d : trs(sl.d)}</RNText>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {slides.map((_, i) => <View key={i}
                style={{ height: 6, width: i === cur ? 26 : 6, borderRadius: 3,
                  backgroundColor: i === cur ? BLUE : '#c3cde2' }} />)}
            </View>
          </View>
          <RNText style={{ fontSize: 64 }}>🛒</RNText>
        </TouchableOpacity>
      )}

      <View style={{ padding: 14 }}>
        <Msg t={err} />
        {loading && <ActivityIndicator style={{ margin: 20 }} color={BLUE} />}

        <View style={s.rowB}>
          <Text style={s.h}>🏪 Shops Near You</Text>
          {!filtering && fShops.length > 4 && (
            <TouchableOpacity onPress={() => setAllShops(!allShops)}>
              <Text style={s.link}>View All →</Text>
            </TouchableOpacity>
          )}
        </View>
        {noAny && <Text
          style={s.empty}>{filtering ? 'No results found.' : 'No shops have joined yet.'}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {shownShops.map((x) => <ShopMini key={x.id} x={x} onPress={onShop} />)}
        </View>

        {shownProds.length > 0 && <Text style={[s.h, { marginTop: 8 }]}>Popular Products</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {shownProds.map((p) => <ProductTile key={p.id} p={p} onProduct={onProduct} />)}
        </View>

        {alts.length > 0 && (
          <View>
            <Text style={[s.sub, { marginTop: 4, marginBottom: 6 }]}>Out of stock here. Available alternatives:</Text>
            <Text style={[s.h, { marginTop: 2 }]}>You may also like</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {alts.map((p) => <ProductTile key={'alt' + p.id} p={p} onProduct={onProduct} />)}
            </View>
          </View>
        )}
      </View>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

// ======================================================================
// BUYER: CATEGORIES
// ======================================================================
function Categories({ shops, onShop, initial, clearInitial }) {
  const [sel, setSel] = useState(initial || null);
  useEffect(() => { if (initial) { setSel(initial); clearInitial(); } }, [initial]);
  if (sel) {
    const list = shops.filter((x) => x.category === sel);
    return (
      <ScrollView>
        <Head title={sel} sub={list.length + ' shops'} onBack={() => setSel(null)} />
        <View style={{ padding: 14 }}>
          {list.length === 0 && <Text style={s.empty}>No shops have joined yet.</Text>}
          {list.map((x) => <ShopCard key={x.id} x={x} onPress={onShop} />)}
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView>
      <Head title="All Categories" />
      <View style={{ padding: 14 }}>
        {CATS.map((c) => {
          const n = shops.filter((x) => x.category === c.k).length;
          return (
            <TouchableOpacity key={c.k} style={s.shopCard} onPress={() => setSel(c.k)}>
              <View style={[s.mic, { backgroundColor: c.bg, width: 60, height: 60, borderRadius: 18 }]}>
                <RNText style={{ fontSize: 28 }}>{c.ic}</RNText>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.shopN}>{c.k}</Text>
                <Text style={s.sub}>{n + ' shops'}</Text>
              </View>
              <RNText style={{ color: '#9aa3b2', fontSize: 22 }}>›</RNText>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ======================================================================
// BUYER: quantity sheet
// ======================================================================
function QtySheet({ p, initial, onClose, onAdd }) {
  const measure = isMeasure(p.unit);
  const chips = measure ? [0.25, 0.5, 1, 2] : [1, 2, 3, 5];
  const [qty, setQty] = useState(initial || 1);
  const [txt, setTxt] = useState('');
  const [sub, setSub] = useState('g');
  const stock = Number(p.online_qty);
  const pick = (v) => { setQty(v); setTxt(''); };
  const type = (t) => {
    setTxt(t);
    const v = parseFloat(t);
    if (!(v > 0)) { setQty(0); return; }
    if (!measure && !Number.isInteger(v)) { setQty(0); return; }
    setQty(measure && sub === 'g' ? v / 1000 : v);
  };
  const setUnit = (u) => {
    setSub(u);
    const v = parseFloat(txt);
    if (v > 0) setQty(u === 'g' ? v / 1000 : v);
  };
  const ok = qty > 0 && qty <= stock + 1e-9;
  return (
    <Sheet onClose={onClose}>
      <View style={s.rowB}>
        <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
          <Photo url={p.image_url} name={p.name} />
          <View style={{ flex: 1 }}>
            <RNText style={{ fontSize: 18, fontWeight: '800', color: INK }}>{p.name}</RNText>
            <Text
              style={s.sub}>{money(p.price)} / {unitLabel(p.unit)} · Stock {qtyLabel(stock, p.unit)}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: MUTE }}>Close</Text></TouchableOpacity>
      </View>
      <Text style={[s.h, { marginTop: 16 }]}>How much do you need?</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {chips.map((c) => <Chip key={c} t={qtyLabel(c, p.unit)} on={!txt && Math.abs(qty - c) < 1e-9} onPress={() => pick(c)} />)}
      </View>
      <Text
        style={[s.sub, { marginVertical: 6 }]}>Or type your own amount{measure ? ' (e.g. 750 g)' : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TextInput
          style={[s.input, { flex: 1, fontSize: 18, fontWeight: '800' }]} value={txt} onChangeText={type} keyboardType={measure ? 'decimal-pad' : 'number-pad'} placeholder={measure ? '750' : '1'} placeholderTextColor="#9aa3b2" />
        {measure && (
          <View style={{ flexDirection: 'row' }}>
            <Chip t={p.unit === 'litre' ? 'ml' : 'g'} on={sub === 'g'} onPress={() => setUnit('g')} />
            <Chip t={p.unit === 'litre' ? 'L' : 'kg'} on={sub === 'kg'} onPress={() => setUnit('kg')} />
          </View>
        )}
      </View>
      <View style={s.totalBox}>
        <View>
          <Text
            style={s.sub}>{qty > 0 ? qtyLabel(qty, p.unit) : '—'} × {money(p.price)}/{unitLabel(p.unit)}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: INK }}>{money(p.price * qty)}</Text>
        </View>
        <Tag t={qty > stock ? 'Not enough stock' : 'In stock'} kind={qty > stock ? 'r' : 'g'} />
      </View>
      <Btn t={ok ? 'Add to cart • ' + money(p.price * qty) : 'Enter a valid amount'} disabled={!ok} onPress={() => onAdd(p, qty)}
        style={{ minHeight: 54 }} />
    </Sheet>
  );
}

// ======================================================================
// BUYER: SHOP PAGE
// ======================================================================
function ShopScreen({ shop, focusId, cart, onBack, onAdd, onCart }) {
  const [ps, setPs] = useState([]);
  const [ld, setLd] = useState(true);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    api('/rest/v1/products?shop_id=eq.' + shop.id + '&active=eq.true&select=*&order=name')
      .then((r) => {
        setPs(r || []);
        if (focusId) {
          const f = (r || []).find((x) => x.id === focusId);
          if (f && Number(f.online_qty) > 0 && shop.is_open) setSheet(f);
        }
      })
      .catch((e) => setErr(errMsg(e))).finally(() => setLd(false));
  }, [shop.id]);

  const cats = ['All', ...Array.from(new Set(ps.map((p) => p.category).filter(Boolean)))];
  const list = ps.filter((p) =>
    (cat === 'All' || p.category === cat) &&
    (!q || matchText((p.name || '') + ' ' + (p.category || ''), q)) &&
    (!lo || p.price >= Number(lo)) && (!hi || p.price <= Number(hi))
  );
  const mine = cart && cart.shop && cart.shop.id === shop.id ? cart.items : {};
  const cnt = Object.keys(mine).length;
  const tot = Object.values(mine).reduce((t, i) => t + i.p.price * i.qty, 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[s.head, { paddingBottom: 18 }]}>
          <TouchableOpacity onPress={onBack}>
            <Text style={{ color: '#cfdcf7', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 12 }}>
            <Photo url={shop.photo_url} name={shop.name} size={86} round />
            <View style={{ flex: 1 }}>
              <RNText style={{ color: '#fff', fontSize: 21, fontWeight: '800' }}>{shop.name}</RNText>
              <RNText
                style={{ color: '#fff', marginTop: 3 }}>★ {shop.rating > 0 ? shop.rating + ' (' + shop.rating_count + ')' : trs('New')}</RNText>
              <Text style={{ color: '#cfdcf7', marginTop: 2 }}>{shop.category} · {shop.area}</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <Tag t={shop.is_open ? '● Open' : '● Closed'} kind={shop.is_open ? 'g' : 'r'} />
                <TouchableOpacity onPress={() => callPhone(shop.phone)}>
                  <RNText style={{ color: '#cfdcf7', fontSize: 12 }}>📞 {shop.phone}</RNText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {!!shop.offer && <RNText style={{ color: '#fff', marginTop: 10 }}>🎁 {shop.offer}</RNText>}
        </View>
        {!shop.is_open && <Msg t="The shop is closed right now." />}

        <View style={s.card}>
          <TextInput
            style={s.input} placeholder="Search in this shop" placeholderTextColor="#9aa3b2" value={q} onChangeText={setQ} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {cats.map((c) => <Chip key={c} t={c} on={cat === c} onPress={() => setCat(c)} />)}
          </ScrollView>
          <Text style={s.label}>Price range (₹)</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Min" placeholderTextColor="#9aa3b2" value={lo} onChangeText={setLo} keyboardType="number-pad" />
            <Text style={{ color: MUTE }}>–</Text>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]} placeholder="Max" placeholderTextColor="#9aa3b2" value={hi} onChangeText={setHi} keyboardType="number-pad" />
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.h}>Products ({list.length})</Text>
          {ld && <ActivityIndicator color={BLUE} />}
          <Msg t={err} />
          {!ld && list.length === 0 && !err && <Text style={s.empty}>No products found.</Text>}
          {list.map((p) => {
            const inCart = mine[p.id];
            const out = Number(p.online_qty) <= 0;
            const lowS = !out && Number(p.online_qty) <= Number(p.low_alert || 5);
            const op = Number(p.original_price || 0);
            return (
              <View key={p.id} style={s.prow}>
                <Photo url={p.image_url} name={p.name} />
                <View style={{ flex: 1 }}>
                  <RNText style={s.shopN}>{p.name}</RNText>
                  <Text
                    style={s.sub}>{money(p.price)} / {unitLabel(p.unit)}{p.category ? ' · ' + p.category : ''}</Text>
                  {op > Number(p.price) && <RNText
                    style={[s.sub, { textDecorationLine: 'line-through' }]}>{money(op)}</RNText>}
                  {out && <Tag t="Out of stock" kind="r" />}
                  {lowS && <Tag t={'Only ' + qtyLabel(Number(p.online_qty), p.unit) + ' left'} kind="y" />}
                </View>
                {out ? <Btn small kind="x" t="Out of stock" disabled /> :
                  inCart ? <Btn small kind="o" t={qtyLabel(inCart.qty, p.unit) + ' ✎'} onPress={() => setSheet(p)} /> :
                    <Btn small t="Add" onPress={() => setSheet(p)} disabled={!shop.is_open} />}
              </View>
            );
          })}
        </View>
        <View style={{ height: 90 }} />
      </ScrollView>
      {cnt > 0 && (
        <TouchableOpacity style={s.cartBar} onPress={onCart}>
          <Text style={s.cartBarT}>{cnt + ' items •'} {money(tot)}</Text>
          <Text style={s.cartBarT}>View Cart →</Text>
        </TouchableOpacity>
      )}
      {sheet && (
        <QtySheet
          p={sheet}
          initial={mine[sheet.id] ? mine[sheet.id].qty : undefined}
          onClose={() => setSheet(null)}
          onAdd={(p, qty) => { onAdd(shop, p, qty); setSheet(null); }}
        />
      )}
    </View>
  );
}

// ======================================================================
// BUYER: UPI payment box (shop QR code + UPI ID + UTR number)
// ======================================================================
function UpiPayBox({ shop, total, info, loading, err, utr, setUtr }) {
  const upi = info && info.upi_id ? String(info.upi_id) : '';
  const qr = info && info.qr_url ? String(info.qr_url) : '';
  const has = !!upi || !!qr;
  return (
    <View style={{ marginTop: 10 }}>
      {loading && <ActivityIndicator color={BLUE} />}
      <Msg t={err} />
      {!loading && !err && !has && (
        <Msg t="This shop has not added UPI details yet. Please choose Cash on Delivery." />
      )}
      {!loading && !err && has && (
        <View style={{ backgroundColor: BG, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: LINE,
          alignItems: 'center' }}>
          <Text style={s.shopN}>Pay with UPI</Text>
          <RNText style={[s.sub, { marginTop: 2 }]}>{'Pay ' + money(total) + ' to ' + shop.name}</RNText>
          {!!qr && <View style={{ marginTop: 12 }}><QrImage url={qr} /></View>}
          {!!upi && (
            <View style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={s.sub}>UPI ID</Text>
              <RNText selectable style={{ fontSize: 17, fontWeight: '800', color: INK, marginTop: 2 }}>{upi}</RNText>
              <Btn small kind="o" t="Open UPI app" onPress={() => openUpi(upi, shop.name, total)}
                style={{ marginTop: 8 }} />
            </View>
          )}
          <Text style={[s.sub, { marginTop: 12, textAlign: 'center' }]}>After paying, enter the 12-digit UTR / transaction number below.</Text>
        </View>
      )}
      {!loading && !err && has && (
        <View style={{ marginTop: 10 }}>
          <Field label="UTR number (12 digits)" value={utr} onChangeText={(v) => setUtr(String(v).replace(/\D/g, ''))}
            keyboardType="number-pad" maxLength={12} placeholder="123456789012" />
        </View>
      )}
    </View>
  );
}


// ======================================================================
// BUYER: CART + CHECKOUT  (place_order RPC)
// ======================================================================
function CartScreen({ cart, setCart, session, needLogin, onDone, profile, setProfile, syncProfile }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dtype, setDtype] = useState('delivery'); // 'delivery' | 'pickup'
  const [pay, setPay] = useState('cod');          // 'cod' | 'upi'
  const [utr, setUtr] = useState('');
  const [pinfo, setPinfo] = useState(null);
  const [ploading, setPloading] = useState(false);
  const [perr, setPerr] = useState('');
  const lock = useRef(false);                      // blocks double taps / duplicate submissions
  const shopId = cart && cart.shop ? cart.shop.id : null;
  // shop QR code + UPI ID (only when the buyer chooses UPI)
  useEffect(() => {
    if (pay !== 'upi' || !shopId) return undefined;
    let dead = false;
    setPloading(true); setPerr(''); setPinfo(null);
    rpc('get_shop_payment', { p_shop_id: shopId })
      .then((r) => {
        const x = Array.isArray(r) ? r[0] : r;
        if (!dead) setPinfo(x && typeof x === 'object' ? x : null);
      })
      .catch((e) => { if (!dead) setPerr(errMsg(e)); })
      .finally(() => { if (!dead) setPloading(false); });
    return () => { dead = true; };
  }, [pay, shopId]);
  const items = cart && cart.items ? Object.values(cart.items) : [];
  if (!items.length) {
    return (
      <View style={{ flex: 1 }}>
        <Head title="Cart" />
        <Text style={s.empty}>Your cart is empty.{'\n'}Open a shop and add products.</Text>
      </View>
    );
  }
  const total = items.reduce((t, i) => t + Math.round(i.p.price * i.qty * 100) / 100, 0);
  const remove = (id) => {
    const n = { ...cart.items }; delete n[id];
    setCart(Object.keys(n).length ? { ...cart, items: n } : null);
  };
  const place = async () => {
    if (lock.current) return;
    if (!session) { needLogin(); return; }
    const name = (profile.name || '').trim(), phone = (profile.phone || '').trim(), address = (profile.address || '').trim();
    if (!name || !/^\d{10}$/.test(phone) || (dtype === 'delivery' && !address)) {
      setMsg(dtype === 'delivery' ? 'Enter name, 10-digit phone and address' : 'Enter your name and 10-digit phone'); return;
    }
    if (pay === 'upi') {
      const has = !!(pinfo && (pinfo.upi_id || pinfo.qr_url));
      if (!has) { setMsg('This shop has not added UPI details yet. Please choose Cash on Delivery.'); return; }
      if (!isUtr(utr)) { setMsg('Pay first, then enter the 12-digit UTR number to place the order.'); return; }
    }
    lock.current = true; setBusy(true); setMsg('');
    try {
      // 1) re-check stock right before ordering
      const ids = items.map((i) => i.p.id).join(',');
      const fresh = await api('/rest/v1/products?id=in.(' + ids + ')&select=id,name,online_qty,active,unit');
      const bad = [];
      items.forEach((i) => {
        const f = (fresh || []).find((x) => x.id === i.p.id);
        if (!f || f.active === false) bad.push(i.p.name + ' (not available)');
        else if (Number(f.online_qty) + 1e-9 < i.qty) bad.push(i.p.name + ' (only ' + qtyLabel(Number(f.online_qty), f.unit) + ' left)');
      });
      if (bad.length) { setMsg('Not enough stock: ' + bad.join(', ') + '. Please update your cart.'); lock.current = false; setBusy(false); return; }
      // 2) place the order through the RPC
      const res = await rpc('place_order', {
        p_shop_id: cart.shop.id,
        p_items: items.map((i) => ({ product_id: i.p.id, qty: i.qty })),
        p_customer_name: name,
        p_customer_phone: phone,
        p_customer_address: dtype === 'pickup' && !address ? 'Pickup from shop' : address,
        p_delivery_type: dtype,
        p_payment_method: pay,
      });
      let r = res;
      if (Array.isArray(r)) r = r[0];
      if (r && typeof r === 'object' && (r.success === false || r.ok === false || r.error)) {
        throw new Error(typeof r.error === 'string' ? r.error : (r.message || 'Order could not be placed'));
      }
      const id = r && typeof r === 'object' ? (r.order_id || r.id || (r.order && r.order.id)) : r;
      if (!id) throw new Error('Order response was not understood. Please check My Orders before trying again.');
      const number = r && typeof r === 'object' ? (r.order_number || (r.order && r.order.order_number)) : null;
      // 3) UPI: save the UTR number with the order
      let utrMsg = '';
      if (pay === 'upi') {
        try {
          await rpc('submit_order_utr', { p_order: String(id), p_utr: utr.trim() });
        } catch (e2) {
          if (e2 && (e2.code === '23505' || /duplicate|unique/i.test(String(e2.message || '')))) {
            utrMsg = 'This UTR number was already used for another order. Please contact the shop.';
          } else {
            utrMsg = 'UTR could not be saved (' + errMsg(e2) + '). Please tell the shop your UTR number: ' + utr.trim();
          }
        }
      }
      if (syncProfile) syncProfile();
      onDone({ id: String(id), number, shop: cart.shop, items, total, pay, pickup: dtype === 'pickup',
        utr: pay === 'upi' ? utr.trim() : '', utrMsg });
    } catch (e) { setMsg(orderErrMsg(e)); lock.current = false; }
    setBusy(false);
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Head title="Cart" sub={cart.shop.name} />
      <View style={s.card}>
        {items.map((i) => (
          <View key={i.p.id} style={s.prow}>
            <Photo url={i.p.image_url} name={i.p.name} size={48} />
            <View style={{ flex: 1 }}>
              <RNText style={s.shopN}>{i.p.name}</RNText>
              <Text
                style={s.sub}>{qtyLabel(i.qty, i.p.unit)} × {money(i.p.price)}/{unitLabel(i.p.unit)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.price}>{money(i.p.price * i.qty)}</Text>
              <TouchableOpacity onPress={() => remove(i.p.id)}>
                <Text style={{ color: RED, marginTop: 4 }}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        <View style={[s.rowB, { marginTop: 10 }]}>
          <Text style={s.h}>Total</Text>
          <Text style={s.h}>{money(total)}</Text>
        </View>
        <Text style={s.sub}>Delivery: agree with the shop (free for now)</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Delivery type</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip t="Home Delivery" on={dtype === 'delivery'} onPress={() => setDtype('delivery')} />
          <Chip t="Pickup" on={dtype === 'pickup'} onPress={() => setDtype('pickup')} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Delivery details</Text>
        <Field label="Your name" value={profile.name} onChangeText={(v) => setProfile({ ...profile,
          name: v })} autoCapitalize="words" />
        <Field label="Phone (10 digits)" value={profile.phone} onChangeText={(v) => setProfile({ ...profile, phone: v })} keyboardType="number-pad" maxLength={10} />
        <Field label={dtype === 'delivery' ? 'Full address' : 'Full address (optional for pickup)'} value={profile.address} onChangeText={(v) => setProfile({ ...profile,
          address: v })} multiline autoCapitalize="sentences" />
        <Text style={s.label}>Payment</Text>
        <View style={{ flexDirection: 'row' }}>
          <Chip t="Cash on Delivery" on={pay === 'cod'} onPress={() => setPay('cod')} />
          <Chip t="UPI" on={pay === 'upi'} onPress={() => setPay('upi')} />
        </View>
        {pay === 'upi' && <Text
          style={[s.sub, { marginTop: 2 }]}>UPI payment is confirmed only after the shop verifies it.</Text>}
        {pay === 'upi' && (
          <UpiPayBox shop={cart.shop} total={total} info={pinfo} loading={ploading} err={perr}
            utr={utr} setUtr={setUtr} />
        )}
      </View>
      <View style={{ padding: 14 }}>
        <Msg t={msg} />
        <Btn t={busy ? 'Please wait...' : 'Place order • ' + money(total)} onPress={place} disabled={busy}
          style={{ minHeight: 54 }} />
        {!session && <Text
          style={[s.sub, { textAlign: 'center', marginTop: 8 }]}>Login or sign up to continue</Text>}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Success({ done, onTrack, onHome }) {
  return (
    <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, paddingTop: 70 }}>
      <View style={s.okOuter}>
        <View style={s.okInner}>
          <RNText style={{ color: '#fff', fontSize: 44, fontWeight: '800' }}>✓</RNText>
        </View>
      </View>
      <Text
        style={{ fontSize: 28, fontWeight: '800', color: INK, textAlign: 'center',
          marginTop: 22 }}>Order placed{'\n'}successfully!</Text>
      <RNText
        style={[s.sub, { textAlign: 'center', marginTop: 8, fontSize: 14 }]}>{done.shop.name} {trs('will confirm within 10 minutes')}</RNText>
      <View style={[s.card, { alignSelf: 'stretch', marginTop: 24, marginHorizontal: 0 }]}>
        <View style={s.rowB}><Text style={s.shopN}>{done.number ? '#' + done.number : shortId(done.id)}</Text><Tag t="New" kind="b" /></View>
        <RNText style={[s.sub, { marginTop: 4 }]} selectable>ID: {done.id}</RNText>
        <RNText
          style={[s.sub, { marginVertical: 8 }]}>{done.items.map((i) => i.p.name + ' ' + qtyLabel(i.qty, i.p.unit)).join(', ')}</RNText>
        <View style={s.rowB}>
          <Text style={s.sub}>{(done.pickup ? 'Pickup' : 'Home Delivery') + ' • ' + (done.pay === 'upi' ? 'UPI' : 'Cash on Delivery')}</Text>
          <Text style={s.price}>{money(done.total)}</Text>
        </View>
        {done.pay === 'upi' && !!done.utr && (
          <View style={[s.rowB, { marginTop: 8 }]}>
            <Text style={s.sub}>UTR Number</Text>
            <RNText selectable style={{ color: INK, fontWeight: '800' }}>{done.utr}</RNText>
          </View>
        )}
        {done.pay === 'upi' && <Text
          style={[s.sub, { marginTop: 6 }]}>UPI payment is confirmed only after the shop verifies it.</Text>}
        {!!done.utrMsg && <View style={{ marginTop: 6 }}><Msg t={done.utrMsg} /></View>}
      </View>
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 14 }}>
        <Btn t="View my orders" onPress={onTrack} />
        <Btn kind="o" t="Go to Home" onPress={onHome} />
      </View>
    </ScrollView>
  );
}

// ======================================================================
// BUYER: ORDERS + TRACK ORDER  (get_my_orders_paginated RPC)
// ======================================================================
function TrackOrder({ o, onBack, onReorder }) {
  const [more, setMore] = useState(false);
  const [pinfo] = useOrderPay(o);
  const items = o.order_items || [];
  const cancelled = o.status === 'cancelled';
  const FLOW = flowOf(o);
  const idx = FLOW.indexOf(o.status);
  const sub = items.reduce((t, i) => t + Number(i.price) * Number(i.qty), 0);
  const shopName = o.shops ? o.shops.name : '';
  const shopPhone = o.shops ? o.shops.phone : '';
  const po = o.pay === 'upi' && pinfo.status ? { ...o, payment_status: pinfo.status } : o;
  return (
    <ScrollView>
      <View style={[s.head, { paddingBottom: 20 }]}>
        <View style={s.rowB}>
          <TouchableOpacity onPress={onBack}>
            <RNText style={{ color: '#fff', fontSize: 24 }}>←</RNText>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => callPhone(shopPhone)}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Help ⓘ</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.headT}>My Order</Text>
        <RNText
          style={{ color: '#cfdcf7', marginTop: 2 }}>{orderNo(o)}{shopName ? ' · ' + shopName : ''}</RNText>
      </View>

      {!cancelled && (
        <View style={[s.card, s.rowB]}>
          <View style={{ flex: 1 }}>
            <Text style={s.sub}>{o.pickup ? 'Pickup' : 'Estimated Delivery'}</Text>
            <Text
              style={{ color: GREEN, fontWeight: '800', fontSize: 15, marginTop: 4 }}>
              {o.status === 'delivered' ? 'Delivered' : o.pickup ? 'Pickup from shop' : estWindow(o.created_at)}
            </Text>
          </View>
          <RNText style={{ fontSize: 44 }}>{o.pickup ? '🏪' : '🛵'}</RNText>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.h}>Order Status</Text>
        {cancelled ? (
          <View>
            <Tag t="Order cancelled" kind="r" />
            {!!o.cancel_reason && <Text style={{ color: RED, marginTop: 8 }}>{o.cancel_reason}</Text>}
          </View>
        ) : FLOW.map((k, i) => {
          const last = i === FLOW.length - 1;
          const done = i < idx || (o.status === 'delivered' && i === idx);
          const current = i === idx && !done;
          const st = STEPS[k];
          return (
            <View key={k} style={{ flexDirection: 'row' }}>
              <View style={{ width: 28, alignItems: 'center' }}>
                <View
                  style={[s.dot, done && { backgroundColor: GREEN, borderColor: GREEN },
                    current && { borderColor: BLUE }]}>
                  {done && <RNText style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>✓</RNText>}
                </View>
                {!last && <View
                  style={{ width: 2, flex: 1, backgroundColor: i < idx ? GREEN : '#d5dcea' }} />}
              </View>
              <View style={{ flex: 1, paddingLeft: 10, paddingBottom: last ? 0 : 18 }}>
                <Text style={[s.shopN, { fontSize: 15 }]}>{st[0]}</Text>
                {k === 'new' && <RNText style={s.sub}>{when(o.created_at)}</RNText>}
                {k !== 'new' && current && !!o.updated_at && <RNText
                  style={s.sub}>{when(o.updated_at)}</RNText>}
                {k !== 'new' && (current || i > idx) && <Text style={s.sub}>{st[1]}</Text>}
              </View>
            </View>
          );
        })}
      </View>

      <View style={s.card}>
        <Text style={s.h}>Delivery Information</Text>
        <Text style={{ color: GREEN, fontWeight: '700' }}>{o.pickup ? '🏪 Pickup from shop' : '🏠 Home Delivery'}</Text>
        <RNText
          style={{ color: INK, marginTop: 6, lineHeight: 20 }}>{o.customer_name ? o.customer_name + '\n' : ''}{o.address}</RNText>
        {!o.pickup && <TouchableOpacity onPress={() => openMap(o.address)} style={{ marginTop: 8 }}>
          <Text style={s.link}>View on Map</Text>
        </TouchableOpacity>}
      </View>

      <View style={s.card}>
        <View style={s.rowB}>
          <Text style={s.h}>Order Summary</Text>
          <TouchableOpacity onPress={() => setMore(!more)}>
            <Text style={s.link}>View Details</Text>
          </TouchableOpacity>
        </View>
        {more && items.map((i) => (
          <View key={i.id} style={[s.rowB, { marginBottom: 6 }]}>
            <RNText style={{ color: INK, flex: 1 }}>{i.name} · {qtyLabel(Number(i.qty), i.unit)}</RNText>
            <RNText style={{ color: INK }}>{money(i.price * i.qty)}</RNText>
          </View>
        ))}
        <View style={s.rowB}>
          <Text style={s.sub}>{items.length + ' Items'}</Text>
          <RNText style={s.sub}>{money(sub)}</RNText>
        </View>
        <View style={[s.rowB, { marginTop: 6 }]}>
          <Text style={s.sub}>Delivery Charge</Text>
          <Text style={{ color: GREEN, fontWeight: '700' }}>Free</Text>
        </View>
        <View style={[s.rowB, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: LINE }]}>
          <Text style={s.shopN}>Total Amount</Text>
          <RNText style={{ color: GREEN, fontWeight: '800', fontSize: 18 }}>{money(o.total)}</RNText>
        </View>
        <RNText style={[s.sub, { marginTop: 4 }]}>{payText(po)}</RNText>
        {o.pay === 'upi' && !!pinfo.utr && (
          <View style={[s.rowB, { marginTop: 6 }]}>
            <Text style={s.sub}>UTR Number</Text>
            <RNText selectable style={{ color: INK, fontWeight: '800' }}>{pinfo.utr}</RNText>
          </View>
        )}
        {o.pay === 'upi' && isPaid(pinfo.status) && (
          <View style={{ marginTop: 8 }}><Tag t="✔ Payment verified" kind="g" /></View>
        )}
      </View>

      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={[s.mic, { backgroundColor: '#dcf5e9' }]}>
          <RNText style={{ fontSize: 22 }}>🎧</RNText>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.shopN}>Need Help?</Text>
          <Text style={s.sub}>Chat with us or call the store</Text>
        </View>
        {!!shopPhone && <Btn small kind="o" t="Call" onPress={() => callPhone(shopPhone)} />}
      </View>

      <View style={{ padding: 14 }}>
        <Btn kind="o" t="Reorder" onPress={() => onReorder(o)} style={{ minHeight: 52 }} />
      </View>
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

function BuyerOrders({ session, needLogin, onReorder }) {
  const [os, setOs] = useState([]);
  const [ld, setLd] = useState(false);
  const [err, setErr] = useState('');
  const [selId, setSelId] = useState(null);
  const [limit, setLimit] = useState(PAGE);
  const limRef = useRef(PAGE);
  limRef.current = limit;
  const load = useCallback((silent) => {
    if (!session) return;
    if (!silent) setLd(true);
    rpc('get_my_orders_paginated', { p_limit: limRef.current, p_offset: 0 })
      .then((r) => { setOs(unwrapList(r).map(normOrder)); setErr(''); })
      .catch((e) => setErr(errMsg(e))).finally(() => setLd(false));
  }, [session]);
  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load, limit]);
  const cancel = (o) => {
    Alert.alert(trs('Cancel order'), orderNo(o), [
      { text: trs('No'), style: 'cancel' },
      { text: trs('Yes'), onPress: async () => {
        try { await rpc('set_order_status', { p_order: o.id, p_status: 'cancelled',
          p_reason: 'Cancelled by customer' }); load(); }
        catch (e) { setErr(errMsg(e)); }
      } },
    ]);
  };
  const sel = selId ? os.find((x) => x.id === selId) : null;
  if (sel) return <TrackOrder o={sel} onBack={() => setSelId(null)} onReorder={onReorder} />;
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={ld} onRefresh={() => load()} />}>
      <Head title="My Orders" sub="Track live orders and view past purchases" />
      {!session && (
        <View style={{ padding: 14 }}>
          <Text style={s.empty}>Login or sign up to continue</Text>
          <Btn t="Login" onPress={needLogin} />
        </View>
      )}
      <Msg t={err} />
      {session && !ld && !err && os.length === 0 && <Text style={s.empty}>No orders yet.</Text>}
      {os.map((o) => {
        const items = o.order_items || [];
        const first = items[0];
        return (
          <TouchableOpacity key={o.id} style={s.card} onPress={() => setSelId(o.id)} activeOpacity={0.85}>
            <View style={s.rowB}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.shopN}>{orderNo(o)}</Text>
                <Tag t={STATUS[o.status] || o.status} kind={o.status === 'delivered' ? 'g' : o.status === 'cancelled' ? 'r' : 'b'} />
              </View>
              <RNText style={s.sub}>{when(o.created_at)}</RNText>
            </View>
            <View style={[s.prow, { marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <RNText
                  style={s.shopN}>{first ? first.name + (items.length > 1 ? ' + ' + (items.length - 1) + ' more' : '') : ''}</RNText>
                <RNText style={s.sub}>{o.shops ? o.shops.name : ''}</RNText>
              </View>
              <Text style={s.price}>{money(o.total)}</Text>
            </View>
            <View style={s.rowB}>
              <Text style={s.sub}>{(o.pickup ? 'Pickup' : 'Home Delivery') + ' • ' + (o.pay === 'upi' ? 'UPI' : 'Cash on Delivery')}</Text>
              <Text style={s.link}>View Details</Text>
            </View>
            {o.status === 'cancelled' && !!o.cancel_reason && <Text
              style={{ color: RED, marginTop: 4 }}>{o.cancel_reason}</Text>}
            {o.status === 'new' && <Btn small kind="r" t="Cancel order" onPress={() => cancel(o)}
              style={{ marginTop: 10, alignSelf: 'flex-start' }} />}
          </TouchableOpacity>
        );
      })}
      {os.length >= limit && (
        <View style={{ padding: 14 }}><Btn kind="o" t="Load more" onPress={() => setLimit(limit + PAGE)} /></View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ======================================================================
// SELLER: shop registration (used only after seller login)
// FIX: 1) seller profile (role = seller) is saved first, with the real authenticated user id
//      2) an existing shop is re-used (no duplicate shop)
//      3) register_my_shop is called only when this user has no shop yet
//      4) the returned shop is checked (owner_id must be this user)
// ======================================================================
function SellerSetup({ onCreated, onCancel, defaultArea }) {
  const [f, setF] = useState({ name: '', owner: '', phone: '', area: defaultArea || '',
    category: 'Grocery', photo: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (busy || lock.current) return;
    if (!f.name.trim() || !f.owner.trim() || !f.area.trim() || !/^\d{10}$/.test(f.phone.trim())) { setMsg('Enter shop name, owner, 10-digit phone and area'); return; }
    lock.current = true; setBusy(true); setMsg('');
    try {
      const uid = SESSION && SESSION.uid;
      if (!uid) throw new Error('Session expired. Please log in again.');
      // 1) seller profile row (role = seller) for the authenticated user
      await ensureSellerProfile(uid, { name: f.owner.trim(), phone: f.phone.trim(), area: f.area.trim(),
        address: f.area.trim(), email: SESSION.email });
      // 2) never create a second shop for the same owner
      let shop = null;
      try {
        let ex = await shopRpc('mine');
        if (Array.isArray(ex)) ex = ex[0];
        if (ex && ex.id) shop = ex;
      } catch (e) {
        if (e.network || e.missingRpc) throw e;
      }
      // 3) create the shop with the existing register_my_shop RPC (it sets owner_id = auth.uid())
      if (!shop) {
        let r = await shopRpc('create', {
          p_name: f.name.trim(), p_owner_name: f.owner.trim(), p_phone: f.phone.trim(),
          p_area: f.area.trim(), p_category: f.category, p_photo_url: f.photo.trim() || null,
        });
        if (Array.isArray(r)) r = r[0];
        if (r && r.id) shop = r;
        if (!shop) {
          try {
            let ex2 = await shopRpc('mine');
            if (Array.isArray(ex2)) ex2 = ex2[0];
            if (ex2 && ex2.id) shop = ex2;
          } catch (e) { /* handled below */ }
        }
      }
      if (!shop || !shop.id) throw new Error('Shop was not created. Please try again.');
      if (shop.owner_id && String(shop.owner_id) !== String(uid)) {
        throw new Error('Shop owner does not match the logged in account. Please log out and log in again.');
      }
      onCreated(shop);
    } catch (e) { setMsg(errMsg(e)); }
    lock.current = false; setBusy(false);
  };
  return (
    <View style={s.card}>
      <Text style={s.h}>Register your shop</Text>
      <Field label="Shop name" value={f.name} onChangeText={set('name')} autoCapitalize="words" />
      <Field label="Owner name" value={f.owner} onChangeText={set('owner')} autoCapitalize="words" />
      <Field label="Phone number" value={f.phone} onChangeText={set('phone')} keyboardType="number-pad" maxLength={10} />
      <Field label="Village / Area" value={f.area} onChangeText={set('area')} autoCapitalize="words" />
      <Field label="Shop photo link (optional)" value={f.photo} onChangeText={set('photo')} placeholder="https://..." />
      <Text style={s.label}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {SHOP_CATS.map((c) => <Chip key={c} t={c} on={f.category === c} onPress={() => setF({ ...f, category: c })} />)}
      </View>
      <Msg t={msg} />
      <Btn t={busy ? 'Please wait...' : 'Open my shop'} onPress={save} disabled={busy} />
      {!!onCancel && <View style={{ marginTop: 8 }}><Btn kind="o" t="Log Out" onPress={onCancel} /></View>}
    </View>
  );
}

function SellerSetupScreen({ defaultArea, onCreated, onLogout, loadErr }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 24 }]}>
        <Logo size={28} />
        <Text style={[s.headT, { marginTop: 12 }]}>Establish Your Local Business Presence</Text>
        <Text style={{ color: '#cfdcf7', marginTop: 4 }}>Sell your products online and reach shoppers near you</Text>
      </View>
      <Msg t={loadErr} />
      <SellerSetup defaultArea={defaultArea} onCreated={onCreated} onCancel={onLogout} />
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ======================================================================
// PROFILE (guest and buyer use the SAME design)
// - guest           : login card + business card ("Create a Shop Profile" -> seller login)
// - logged-in buyer : account card + Saved Addresses + Log Out, NO business card
// ======================================================================
function Profile({ session, needLogin, onPartner, onLogout, onOrders, lang, onLang, profile, onSaveProfile, loc, onLoc }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [pbusy, setPbusy] = useState(false);
  const [pmsg, setPmsg] = useState('');
  const guest = !session;
  const display = profile.name || (session ? session.email : 'Guest');
  const langName = (LANGS.find((l) => l[0] === lang) || LANGS[0])[1];
  const locText = loc && (loc.full || loc.area) ? (loc.full || loc.area) : 'Select your location';
  const saveDraft = async () => {
    if (pbusy) return;
    if (draft.phone && !/^\d{10}$/.test(draft.phone.trim())) { setPmsg('Phone (10 digits)'); return; }
    setPbusy(true); setPmsg('');
    const m = await onSaveProfile(draft);
    setPbusy(false);
    if (m) { setPmsg(m); } else { setEditing(false); }
  };
  const toggleEdit = () => { setDraft(profile); setPmsg(''); setEditing(!editing); };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      {/* hero */}
      <View style={[s.head, { paddingBottom: 70, alignItems: 'center' }]}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.18)',
          alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: LIME }}>
          <RNText style={{ fontSize: guest ? 40 : 38, color: '#fff', fontWeight: '800' }}>
            {guest ? '👤' : String(display)[0].toUpperCase()}
          </RNText>
        </View>
        <RNText style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 12 }} numberOfLines={1}>
          {guest ? trs('Guest') : display}
        </RNText>
        <RNText style={{ color: '#cfdcf7', marginTop: 4, textAlign: 'center' }} numberOfLines={1}>
          {guest ? trs('Login or sign up to continue') : session.email}
        </RNText>
      </View>

      {/* login card (guest) / account card (buyer), overlapping the hero */}
      {guest ? (
        <View style={[s.card, { marginTop: -48, padding: 18 }]}>
          <Text style={s.h}>Welcome to NearKart</Text>
          <Text style={[s.sub, { marginBottom: 12 }]}>Your neighbourhood, your marketplace.</Text>
          <Btn t="Login" onPress={needLogin} style={{ minHeight: 50 }} />
        </View>
      ) : (
        <View style={[s.card, { marginTop: -48, padding: 18 }]}>
          <Text style={s.h}>Welcome to NearKart</Text>
          <RNText style={{ color: INK, marginTop: 2 }}>
            {profile.phone ? '📞 +91 ' + profile.phone : '📞 —'}
          </RNText>
          <RNText style={{ color: INK, marginTop: 6 }} numberOfLines={2}>
            {'📍 ' + (loc && (loc.full || loc.area) ? (loc.full || loc.area) : '—')}
          </RNText>
          {!!profile.address && (
            <RNText style={{ color: MUTE, marginTop: 6 }} numberOfLines={2}>{'🏠 ' + profile.address}</RNText>
          )}
        </View>
      )}

      {/* quick tiles */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
        paddingHorizontal: 14, marginTop: 4 }}>
        <ProfTile ic="📍" bg="#e8f0ff" title="Delivery Location" sub={locText} onPress={onLoc} />
        {!guest && (
          <ProfTile ic="🏠" bg="#e3ecff" title="Saved Addresses" sub={profile.address || 'Full address'}
            onPress={toggleEdit} />
        )}
        <ProfTile ic="🌐" bg="#e3ecff" title="Language" sub={langName} onPress={() => onLang('pick')} />
        <ProfTile ic="📦" bg="#fff0d6" title="My Orders"
          sub={guest ? 'Login or sign up to continue' : 'Track live orders and view past purchases'}
          onPress={guest ? needLogin : onOrders} />
        <ProfTile ic="🎧" bg="#dcf5e9" title="Customer Support" sub="Instant chat & order queries"
          onPress={() => Alert.alert(trs('Customer Support'), trs('Coming soon'))} />
        {!guest && (
          <ProfTile ic="↪" bg="#fdecef" title="Log Out" sub="End shopping session" onPress={onLogout} danger />
        )}
      </View>

      {/* saved address form (buyer) */}
      {!guest && editing && (
        <View style={s.card}>
          <Text style={s.h}>Saved Addresses</Text>
          <Field label="Your name" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} autoCapitalize="words" />
          <Field label="Phone (10 digits)" value={draft.phone} onChangeText={(v) => setDraft({ ...draft, phone: v })}
            keyboardType="number-pad" maxLength={10} />
          <Field label="Full address" value={draft.address} onChangeText={(v) => setDraft({ ...draft, address: v })}
            multiline autoCapitalize="sentences" />
          <Msg t={pmsg} />
          <Btn t={pbusy ? 'Please wait...' : 'Save profile'} onPress={saveDraft} disabled={pbusy} />
        </View>
      )}

      {/* business card (guest only) */}
      {guest && (
        <View style={{ paddingHorizontal: 14, marginTop: 6 }}>
          <GradientBox style={{ borderRadius: 26, padding: 20 }}>
            <RNText style={{ fontSize: 34 }}>🏪</RNText>
            <Text style={{ fontSize: 24, fontWeight: '800', color: INK, marginTop: 6, lineHeight: 30 }}>
              Establish Your Local Business Presence
            </Text>
            <Text style={{ color: INK, marginTop: 8, lineHeight: 21 }}>
              Create your unique shop profile and connect directly with local customers. A simple process to list your products and take orders.
            </Text>
            <TouchableOpacity onPress={onPartner} activeOpacity={0.85}
              style={{ backgroundColor: '#fff', borderRadius: 16, paddingVertical: 15, marginTop: 16,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              <Text style={{ color: BLUE, fontWeight: '800', fontSize: 17 }}>Create a Shop Profile</Text>
              <RNText style={{ fontSize: 20 }}>🏡✏️</RNText>
            </TouchableOpacity>
          </GradientBox>
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ======================================================================
// SELLER (PARTNER HUB)
// ======================================================================
function useOrders(shopId) {
  const [os, setOs] = useState([]);
  const [err, setErr] = useState('');
  const [limit, setLimit] = useState(SPAGE);
  const limRef = useRef(SPAGE);
  limRef.current = limit;
  const prev = useRef(null);
  const [alertMsg, setAlertMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const r = await rpc('get_shop_orders_paginated', { p_shop_id: shopId, p_limit: limRef.current, p_offset: 0 });
      const list = unwrapList(r).map(normOrder);
      setOs(list); setErr('');
      const n = list.filter((o) => o.status === 'new').length;
      if (prev.current !== null && n > prev.current) { if (PREF.vib) Vibration.vibrate([0, 300, 120,
        300]); setAlertMsg('🔔 New order received!'); }
      prev.current = n;
    } catch (e) { setErr(errMsg(e)); }
  }, [shopId]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load, limit]);
  return { os, load, err, alertMsg, clearAlert: () => setAlertMsg(''), hasMore: os.length >= limit,
    loadMore: () => setLimit((l) => l + SPAGE) };
}

// +10 online stock with optimistic concurrency (update_shop_product_stock)
async function bumpStock(shop, p, reload) {
  try {
    await rpc('update_shop_product_stock', {
      p_shop_id: shop.id, p_product_id: p.id,
      p_online_qty: Number(p.online_qty) + 10, p_shop_qty: Number(p.shop_qty || 0),
      p_expected_version: p.stock_version,
    });
    reload();
    return '';
  } catch (e) {
    if (isConflict(e)) { reload(); return '⚠️ Stock was changed elsewhere. Latest stock loaded - please try again.'; }
    return errMsg(e);
  }
}

function SellerDash({ shop, setShop, os, products, goTab, openOrder, reloadP, ordersErr }) {
  const [offer, setOffer] = useState(shop.offer || '');
  const [msg, setMsg] = useState('');
  const patch = async (b) => {
    try {
      const body = { p_shop_id: shop.id };
      if ('is_open' in b) body.p_is_open = b.is_open;
      if ('offer' in b) { body.p_offer = b.offer; body.p_update_offer = true; }
      let r = await shopRpc('update', body);
      if (Array.isArray(r)) r = r[0];
      setShop(r && r.id ? { ...shop, ...r } : { ...shop, ...b }); setMsg('✅ Saved');
    } catch (e) { setMsg(errMsg(e)); }
  };
  const newOrdersCount = os.filter(
  (o) => o.status === 'new'
).length;

const totalOrdersCount = os.length;

const sales = os
  .filter((o) => o.status !== 'cancelled')
  .reduce((total, o) => total + Number(o.total || 0), 0);
  const lowP = products.filter((p) => p.active !== false && Number(p.online_qty) <= Number(p.low_alert || 5));
  const addStock = async (p) => { const m = await bumpStock(shop, p, reloadP); setMsg(m); };
  const stats = [
  ['🛍️', newOrdersCount, 'New Orders'],
  ['📋', totalOrdersCount, 'Total Orders'],
  ['₹', money(sales), 'Total Sales'],
  ['⭐', shop.rating > 0 ? shop.rating : '—', 'Shop Rating'],
];
  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View style={[s.head, { paddingBottom: 26 }]}>
        <View style={s.rowB}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 }}>
            <Photo url={shop.photo_url} name={shop.name} size={60} round />
            <View style={{ flex: 1 }}>
              <RNText
                style={{ color: '#fff', fontSize: 20, fontWeight: '800' }} numberOfLines={1}>{shop.name} ✔</RNText>
              <RNText style={{ color: '#cfdcf7' }} numberOfLines={1}>{shop.category} · {shop.area}</RNText>
            </View>
          </View>
          <TouchableOpacity onPress={() => patch({ is_open: !shop.is_open })}
            style={[s.pill, { backgroundColor: shop.is_open ? '#dcf5e1' : '#fbe0db' }]}>
            <Text
              style={{ fontWeight: '800', color: shop.is_open ? '#0a6b3f' : '#9a2314' }}>{shop.is_open ? '● Open' : '● Closed'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Msg t={msg} ok={msg.startsWith('✅')} />
      <Msg t={ordersErr} />
      <View style={s.card}>
        <Text style={s.h}>Today's Summary</Text>
        <View style={{ flexDirection: 'row' }}>
          {stats.map(([ic, v, l]) => (
            <View key={l} style={{ flex: 1, alignItems: 'center' }}>
              <RNText style={{ fontSize: 22 }}>{ic}</RNText>
              <RNText style={{ fontSize: 17, fontWeight: '800', color: INK, marginTop: 4 }}>{v}</RNText>
              <Text style={{ fontSize: 11, color: MUTE, textAlign: 'center' }}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.card}>
        <View style={s.rowB}>
          <Text style={s.h}>📣 Live Shop Advertisement</Text>
          <Tag t={shop.offer ? 'Published' : 'Empty'} />
        </View>
        {!!shop.offer && <View style={s.adBox}>
          <RNText style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{shop.offer}</RNText>
        </View>}
        <Field label="Offer (shown to customers)" value={offer} onChangeText={setOffer} placeholder="Weekend special: 20% OFF" autoCapitalize="sentences" />
        <Btn t="Publish" onPress={() => patch({ offer: offer.trim() || null })} />
      </View>
      {lowP.length > 0 && (
        <View style={s.card}>
          <Text style={s.h}>⚠️ Stock alert</Text>
          {lowP.slice(0, 4).map((p) => (
            <View key={p.id} style={s.prow}>
              <View style={{ flex: 1 }}>
                <RNText style={s.shopN}>{p.name}</RNText>
                <Text
                  style={s.sub}>{Number(p.online_qty) <= 0 ? 'Out of stock' : 'Only ' + qtyLabel(Number(p.online_qty), p.unit) + ' left'}</Text>
              </View>
              <Btn small t="+10" onPress={() => addStock(p)} />
            </View>
          ))}
        </View>
      )}
      <View style={s.card}>
        <View style={s.rowB}>
          <Text style={s.h}>Recent Customer Orders</Text>
          <TouchableOpacity onPress={() => goTab('orders')}>
            <Text style={s.link}>View All →</Text>
          </TouchableOpacity>
        </View>
        {os.length === 0 && <Text style={s.sub}>No orders yet.</Text>}
        {os.slice(0, 3).map((o) => (
          <TouchableOpacity key={o.id} style={s.prow} onPress={() => openOrder(o.id)}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.shopN}>{orderNo(o)}</Text>
                <Tag t={STATUS[o.status] || o.status} kind={o.status === 'cancelled' ? 'r' : o.status === 'delivered' ? 'g' : 'b'} />
              </View>
              <RNText style={s.sub}>{o.customer_name} · {(o.order_items || []).length} items</RNText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.price}>{money(o.total)}</Text>
              <RNText style={s.sub}>{when(o.created_at)}</RNText>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}
// ---------- Seller: order details ----------
function OrderDetails({ o, onBack, load }) {
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);
  const [pinfo, reloadPay] = useOrderPay(o);
  const items = o.order_items || [];
  const shown = all ? items : items.slice(0, 3);
  const sub = items.reduce((t, i) => t + Number(i.price) * Number(i.qty), 0);
  const FLOW = flowOf(o);
  const idx = FLOW.indexOf(o.status);
  const nextKey = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const n = FLOW.length;
  const paid = isPaid(pinfo.status);
  const payRejected = isRejectedPay(pinfo.status);
  const po = o.pay === 'upi' && pinfo.status ? { ...o, payment_status: pinfo.status } : o;
  const act = async (st, why) => {
    try { await rpc('set_order_status', { p_order: o.id, p_status: stDB(st), p_reason: why || null }); setErr(''); load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const verifyPay = async (ok) => {
    try {
      await rpc('verify_order_payment', { p_order: o.id, p_verified: ok });
      setErr(''); reloadPay(); load();
    } catch (e) { setErr(errMsg(e)); }
  };
  const reject = () => Alert.alert(trs('Reject Order'), orderNo(o), [
    { text: trs('No'), style: 'cancel' },
    { text: trs('Yes'), onPress: () => act('cancelled', 'Rejected by shop') },
  ]);
  const bill = () => Alert.alert(orderNo(o), items.map((i) => i.name + ' — ' + qtyLabel(Number(i.qty),
    i.unit) + ' = ' + money(i.price * i.qty)).join('\n') + '\n\n' + trs('Total Amount') + ': ' + money(o.total));
  const BTNS = [
    ['accepted', '✓', 'Accept Order', GREEN, '#fff', '#bfe3cf'],
    ['reject', '✕', 'Reject Order', RED, '#fff', '#f6c4d0'],
    ['preparing', '▢', 'Start Preparing', BLUE, '#fff', '#c3d3f5'],
    ['ready', '☑', 'Mark as Ready', '#6a3fc2', '#fff', '#d8cdf3'],
    ['on_the_way', '🛵', 'Out for Delivery', ORANGE, '#fff', '#f5d9b8'],
    ['delivered', '✔', 'Mark as Delivered', GREEN, '#fff', '#bfe3cf'],
  ].filter((b) => b[0] === 'reject' || FLOW.includes(b[0]));
  return (
    <ScrollView>
      <View style={[s.head, { paddingBottom: 20 }]}>
        <View style={s.rowB}>
          <TouchableOpacity onPress={onBack}>
            <RNText style={{ color: '#fff', fontSize: 24 }}>←</RNText>
          </TouchableOpacity>
          <Tag t={STATUS[o.status] || o.status} kind={o.status === 'cancelled' ? 'r' : o.status === 'delivered' ? 'g' : 'b'} />
        </View>
        <Text style={s.headT}>Order Details</Text>
        <RNText style={{ color: '#cfdcf7', marginTop: 2 }}>{orderNo(o)} · {when(o.created_at)}</RNText>
      </View>
      <Msg t={err} />

      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={[s.mic, { borderRadius: 23, backgroundColor: '#e8f0ff' }]}>
          <RNText style={{ fontSize: 22 }}>👤</RNText>
        </View>
        <View style={{ flex: 1 }}>
          <RNText style={s.shopN}>{o.customer_name}</RNText>
          <RNText style={s.sub}>{o.phone}</RNText>
        </View>
        <Btn small kind="o" t="Call" onPress={() => callPhone(o.phone)} />
      </View>

      <View style={s.card}>
        <Text style={s.h}>Delivery Information</Text>
        <Text style={{ color: GREEN, fontWeight: '700' }}>{o.pickup ? '🏪 Pickup from shop' : '🏠 Home Delivery'}</Text>
        <RNText style={{ color: INK, marginTop: 6, lineHeight: 20 }}>{o.address}</RNText>
        {!o.pickup && <TouchableOpacity onPress={() => openMap(o.address)} style={{ marginTop: 8 }}>
          <Text style={s.link}>View on Map</Text>
        </TouchableOpacity>}
      </View>

      {o.pay === 'upi' && (
        <View style={s.card}>
          <View style={s.rowB}>
            <Text style={s.h}>💳 UPI Payment</Text>
            {paid ? <Tag t="✔ Payment verified" kind="g" />
              : payRejected ? <Tag t="Payment not received" kind="r" />
                : <Tag t="Pending verification" kind="y" />}
          </View>
          <View style={s.rowB}>
            <Text style={s.sub}>UTR Number</Text>
            {pinfo.utr
              ? <RNText selectable style={{ color: INK, fontWeight: '800', fontSize: 16 }}>{pinfo.utr}</RNText>
              : <RNText style={{ color: RED, fontWeight: '700' }}>Not submitted yet</RNText>}
          </View>
          <View style={[s.rowB, { marginTop: 6 }]}>
            <Text style={s.sub}>Amount to receive</Text>
            <RNText style={{ color: GREEN, fontWeight: '800' }}>{money(o.total)}</RNText>
          </View>
          <Text style={[s.sub, { marginTop: 8 }]}>Check this UTR number in your UPI app / bank statement, then confirm the payment.</Text>
          {!!pinfo.utr && !paid && o.status !== 'cancelled' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn kind="g" t="Payment verified" style={{ flex: 1.3 }} onPress={() => verifyPay(true)} />
              <Btn kind="r" t="Not received" style={{ flex: 1 }} onPress={() => verifyPay(false)} />
            </View>
          )}
          {paid && o.status !== 'cancelled' && (
            <View style={{ marginTop: 10 }}>
              <Btn small kind="o" t="Not received" onPress={() => verifyPay(false)} style={{ alignSelf: 'flex-start' }} />
            </View>
          )}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.h}>Order Summary</Text>
        <View style={s.rowB}>
          <Text style={s.sub}>Items</Text>
          <RNText style={s.sub}>{items.length + ' ' + trs('Items')}</RNText>
        </View>
        <View style={[s.rowB, { marginTop: 6 }]}>
          <Text style={s.sub}>Subtotal</Text>
          <RNText style={s.sub}>{money(sub)}</RNText>
        </View>
        <View style={[s.rowB, { marginTop: 6 }]}>
          <Text style={s.sub}>Delivery Charge</Text>
          <Text style={{ color: GREEN, fontWeight: '700' }}>Free</Text>
        </View>
        <View style={[s.rowB, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: LINE }]}>
          <Text style={s.shopN}>Total Amount</Text>
          <RNText style={{ color: GREEN, fontWeight: '800', fontSize: 18 }}>{money(o.total)}</RNText>
        </View>
        <RNText style={[s.sub, { marginTop: 4 }]}>{payText(po)}</RNText>
        <TouchableOpacity onPress={bill} style={s.billRow}>
          <Text style={{ color: BLUE, flex: 1, fontWeight: '600' }}>📄 View Bill / Invoice</Text>
          <RNText style={{ color: MUTE, fontSize: 20 }}>›</RNText>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <View style={s.rowB}>
          <Text
            style={s.h}>Order Items ({items.length})</Text>{items.length > 3 && <TouchableOpacity onPress={() => setAll(!all)}>
            <Text style={s.link}>View All</Text>
          </TouchableOpacity>}</View>
        {shown.map((i) => (
          <View key={i.id} style={s.prow}>
            <Photo name={i.name} size={40} />
            <View style={{ flex: 1 }}>
              <RNText style={s.shopN}>{i.name}</RNText>
              <RNText style={s.sub}>{qtyLabel(Number(i.qty), i.unit)} × {money(i.price)}</RNText>
            </View>
            <RNText style={s.price}>{money(i.price * i.qty)}</RNText>
          </View>
        ))}
        {!all && items.length > 3 && <RNText
          style={[s.sub, { marginTop: 6 }]}>... {items.length - 3} +</RNText>}
      </View>

      {o.status !== 'cancelled' ? (
        <View style={s.card}>
          <Text style={s.h}>Update Order Status</Text>
          <View style={{ height: 24, justifyContent: 'center', marginBottom: 4 }}>
            <View
              style={{ position: 'absolute', left: (50 / n) + '%', right: (50 / n) + '%', top: 11,
                height: 2, backgroundColor: '#d5dcea' }}>
              <View
                style={{ width: (idx <= 0 ? 0 : (idx / (n - 1)) * 100) + '%', height: 2, backgroundColor: BLUE }} />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {FLOW.map((k, i) => (
                <View key={k} style={{ flex: 1, alignItems: 'center' }}>
                  <View
                    style={[s.sdot, i <= idx && { backgroundColor: BLUE, borderColor: BLUE }]}>{i < idx && <RNText
                      style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</RNText>}</View>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 14 }}>
            {FLOW.map((k, i) => (
              <View key={k} style={{ flex: 1, alignItems: 'center', paddingHorizontal: 1 }}>
                <Text
                  style={{ fontSize: 9, textAlign: 'center', color: i === idx ? BLUE : MUTE,
                    fontWeight: i === idx ? '800' : '500' }}>{SHORT[k]}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {BTNS.map(([k, ic, t, c, bg, bd]) => {
              const enabled = o.status !== 'delivered' && (k === 'reject' ? o.status === 'new' : k === nextKey);
              return (
                <TouchableOpacity
                  key={k}
                  disabled={!enabled}
                  onPress={() => (k === 'reject' ? reject() : act(k))}
                  style={[s.abtn, { backgroundColor: bg, borderColor: enabled ? bd : LINE,
                    opacity: enabled ? 1 : 0.45 }]}
                >
                  <RNText style={{ color: c, fontSize: 15, fontWeight: '800' }}>{ic}</RNText>
                  <Text style={{ color: c, fontWeight: '800', fontSize: 13, flexShrink: 1 }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[s.sub, { marginTop: 10 }]}>ⓘ Update the status as per the order progress.</Text>
        </View>
      ) : (
        <View style={s.card}>
          <Tag t="Order cancelled" kind="r" />
          {!!o.cancel_reason && <Text style={{ color: RED, marginTop: 8 }}>{o.cancel_reason}</Text>}
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function SellerOrders({ os, load, selId, setSel, err0, hasMore, loadMore }) {
  const [tab, setTab] = useState('new');
  const [err, setErr] = useState('');
  const act = async (o, st, why) => {
    try { await rpc('set_order_status', { p_order: o.id, p_status: stDB(st), p_reason: why || null }); setErr(''); load(); }
    catch (e) { setErr(errMsg(e)); }
  };
  const reject = (o) => Alert.alert(trs('Reject'), orderNo(o), [
    { text: trs('No'), style: 'cancel' },
    { text: trs('Yes'), onPress: () => act(o, 'cancelled', 'Rejected by shop') },
  ]);
  const sel = selId ? os.find((x) => x.id === selId) : null;
  if (sel) return <OrderDetails o={sel} onBack={() => setSel(null)} load={load} />;
  const list = os.filter((o) => o.status === tab);
  return (
    <ScrollView>
      <Head title="Seller Orders" sub="Real-time incoming orders" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: 14, paddingBottom: 4 }}>
        {ALL_ST.map((k) => <Chip key={k} t={STATUS[k] + ' ' + os.filter((o) => o.status === k).length} on={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView>
      <Msg t={err || err0} />
      {list.length === 0 && <Text style={s.empty}>No orders in this list.</Text>}
      {list.map((o) => (
        <TouchableOpacity key={o.id} style={s.card} onPress={() => setSel(o.id)} activeOpacity={0.85}>
          <View style={s.rowB}>
            <Text style={s.shopN}>{orderNo(o)}</Text>
            {o.status === 'new' ? <Tag t={'⏱ ' + minsLeft(o.created_at) + ' min left'} kind="y" /> : <Tag t={STATUS[o.status] || o.status} kind={o.status === 'cancelled' ? 'r' : 'b'} />}
          </View>
          <RNText style={[s.shopN, { marginTop: 8 }]}>{o.customer_name}</RNText>
          <RNText style={s.sub}>{o.pickup ? '🏪 ' + trs('Pickup') : '📍 ' + o.address}</RNText>
          <View style={[s.rowB, { marginTop: 8 }]}>
            <RNText
              style={s.sub}>{(o.order_items || []).length + ' ' + trs('Items')} · {when(o.created_at)} · {o.pay === 'upi' ? 'UPI' : 'COD'}</RNText>
            <RNText style={[s.price, { color: GREEN }]}>{money(o.total)}</RNText>
          </View>
          {o.pay === 'upi' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <RNText style={s.sub}>{o.utr_number ? 'UTR: ' + o.utr_number : 'UTR: open the order to see it'}</RNText>
              {isPaid(o.payment_status) && <Tag t="✔ Payment verified" kind="g" sm />}
            </View>
          )}
          {o.status === 'new' && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn kind="g" t="Accept" style={{ flex: 1.3 }} onPress={() => act(o, 'accepted')} />
              <Btn kind="r" t="Reject" style={{ flex: 1 }} onPress={() => reject(o)} />
            </View>
          )}
        </TouchableOpacity>
      ))}
      {hasMore && <View style={{ padding: 14 }}><Btn kind="o" t="Load more" onPress={loadMore} /></View>}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---------- Seller: product add / edit sheet (seller_save_product + update_shop_product_stock) ----------
function ProductForm({ shop, product, onClose, onDone }) {
  const p = product;
  const [f, setF] = useState({
    name: p ? p.name : '', cat: p && p.category ? p.category : PROD_CATS[0], unit: p ? p.unit : 'kg',
    price: p ? num(Number(p.price)) : '', op: p && p.original_price ? num(Number(p.original_price)) : '',
    oq: p ? num(Number(p.online_qty)) : '', sq: p ? num(Number(p.shop_qty || 0)) : '',
    low: p && p.low_alert ? num(Number(p.low_alert)) : '5',
    desc: p && p.description ? p.description : '',
    img: p && p.image_url ? p.image_url : '',
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const save = async () => {
    if (busy) return;
    const price = Number(f.price), oq = parseFloat(f.oq), sq = parseFloat(f.sq) || 0;
    const op = f.op ? Number(f.op) : 0;
    if (!f.name.trim() || !(price > 0) || isNaN(oq) || oq < 0) { setMsg('Enter name, price and online stock'); return; }
    if (f.op && (isNaN(op) || op < price)) { setMsg('Original price must be equal to or higher than the price'); return; }
    const prod = {
      name: f.name.trim(), category: f.cat, unit: f.unit, price,
      original_price: op > 0 ? op : null,
      description: f.desc.trim() || null,
      image_url: f.img.trim() || null,
      low_alert: parseFloat(f.low) > 0 ? parseFloat(f.low) : 5,
      active: p ? p.active !== false : true,
    };
    if (!p) { prod.online_qty = oq; prod.shop_qty = sq; }
    setBusy(true); setMsg('');
    try {
      const saved = await rpc('seller_save_product', { p_shop_id: shop.id, p_product_id: p ? p.id : null, p_product: prod });
      if (p && (Math.abs(oq - Number(p.online_qty)) > 1e-9 || Math.abs(sq - Number(p.shop_qty || 0)) > 1e-9)) {
        let sv = saved && typeof saved === 'object' ? (Array.isArray(saved) ? saved[0] : saved) : null;
        if (sv && sv.product) sv = sv.product;
        const ver = sv && sv.stock_version !== undefined && sv.stock_version !== null ? sv.stock_version : p.stock_version;
        try {
          await rpc('update_shop_product_stock', { p_shop_id: shop.id, p_product_id: p.id,
            p_online_qty: oq, p_shop_qty: sq, p_expected_version: ver });
        } catch (e2) {
          if (isConflict(e2)) { onDone('⚠️ Product saved, but stock was changed elsewhere. Latest stock loaded - please set it again.'); setBusy(false); return; }
          throw e2;
        }
      }
      onDone(p ? '✅ Saved' : '✅ Product added');
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      <View style={s.rowB}>
        <Text style={s.h}>{p ? 'Edit product' : 'New product'}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: MUTE }}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
        <Field label="Name" value={f.name} onChangeText={set('name')} autoCapitalize="words" />
        <Text style={s.label}>Category</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>{PROD_CATS.map((c) => <Chip key={c} t={c} on={f.cat === c} onPress={() => set('cat')(c)} />)}</View>
        <Text style={s.label}>Unit (how you sell it)</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>{UNITS.map((u) => <Chip key={u} t={u} on={f.unit === u} onPress={() => set('unit')(u)} />)}</View>
        <Field label={'Price (₹ per ' + unitLabel(f.unit) + ')'} value={f.price} onChangeText={set('price')} keyboardType="decimal-pad" />
        <Field label="Original price (₹, optional)" value={f.op} onChangeText={set('op')} keyboardType="decimal-pad" />
        <Field label={'Online stock (' + unitLabel(f.unit) + ')'} value={f.oq} onChangeText={set('oq')} keyboardType="decimal-pad" />
        <Field label={'Shop stock (' + unitLabel(f.unit) + ', counter only)'} value={f.sq} onChangeText={set('sq')} keyboardType="decimal-pad" />
        <Field label="Low stock alert at" value={f.low} onChangeText={set('low')} keyboardType="decimal-pad" />
        <Field label="Description (optional)" value={f.desc} onChangeText={set('desc')} multiline autoCapitalize="sentences" />
        <Field label="Photo link (optional)" value={f.img} onChangeText={set('img')} placeholder="https://..." />
      </ScrollView>
      <Msg t={msg} />
      <View style={{ height: 8 }} />
      <Btn t={busy ? 'Please wait...' : p ? 'Save' : 'Add product'} onPress={save} disabled={busy}
        style={{ minHeight: 50 }} />
    </Sheet>
  );
}

// ---------- Seller: products table ----------
function SellerProducts({ shop, products, reloadP, addOpen, setAddOpen, perr }) {
  const [q, setQ] = useState('');
  const [fl, setFl] = useState('all');
  const [showF, setShowF] = useState(false);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');
  const stat = (p) => { if (p.active === false) return 'inactive'; const n = Number(p.online_qty); return n <= 0 ? 'out' : n <= Number(p.low_alert || 5) ? 'low' : 'in'; };
  const list = products.filter((p) => (!q || matchText((p.name || '') + ' ' + (p.category || ''), q)) && (fl === 'all' || stat(p) === fl));
  const setActive = async (p, on) => {
    try {
      await rpc('seller_set_product_active', { p_shop_id: shop.id, p_product_id: p.id, p_active: on });
      setMsg('✅ Saved'); reloadP();
    } catch (e) { setMsg(errMsg(e)); }
  };
  const plus10 = async (p) => { const m = await bumpStock(shop, p, reloadP); setMsg(m || '✅ Saved'); };
  const menu = (p) => Alert.alert(p.name, '', [
    { text: trs('+10 online'), onPress: () => plus10(p) },
    p.active === false
      ? { text: trs('Activate'), onPress: () => setActive(p, true) }
      : { text: trs('Deactivate'), style: 'destructive', onPress: () => Alert.alert(trs('Deactivate'), p.name, [
        { text: trs('No'), style: 'cancel' },
        { text: trs('Yes'), onPress: () => setActive(p, false) },
      ]) },
    { text: trs('Close'), style: 'cancel' },
  ]);
  const done = (m) => { setEdit(null); setAddOpen(false); setMsg(m); reloadP(); };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Head
          title="All Products"
          sub={products.length + ' products in total'}
          right={<Btn small t="+ Add Product" onPress={() => { setEdit(null); setAddOpen(true); }} />}
        />
        <Msg t={msg} ok={msg.startsWith('✅')} />
        <Msg t={perr} />
        <View style={s.card}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="Search products..."
              placeholderTextColor="#9aa3b2"
              value={q}
              onChangeText={setQ}
            />
            <Btn small kind="o" t="Filter" onPress={() => setShowF(!showF)} />
          </View>
          {showF && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
              {[['all', 'All'], ['in', 'In stock'], ['low', 'Low stock'], ['out', 'Out of stock'], ['inactive', 'Inactive']].map(([k, t]) => (
                <Chip key={k} t={t} on={fl === k} onPress={() => setFl(k)} />
              ))}
            </View>
          )}
        </View>

        <View style={s.card}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 2 }]}>Product</Text>
            <Text style={[s.th, { flex: 1.2 }]}>Stock</Text>
            <Text style={[s.th, { flex: 1 }]}>Price</Text>
            <Text style={[s.th, { flex: 1.1 }]}>Status</Text>
          </View>
          {list.length === 0 && <Text style={s.empty}>No products yet.</Text>}
          {list.map((p) => {
            const st = stat(p);
            return (
              <TouchableOpacity key={p.id} style={[s.trow, st === 'inactive' && { opacity: 0.6 }]} onPress={() => setEdit(p)} onLongPress={() => menu(p)} activeOpacity={0.8}>
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Photo url={p.image_url} name={p.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <RNText style={s.shopN} numberOfLines={1}>{p.name}</RNText>
                    <RNText style={s.sub} numberOfLines={1}>{p.category || ''}</RNText>
                  </View>
                </View>
                <View style={{ flex: 1.2 }}>
                  <RNText style={{ color: INK, fontWeight: '700' }}>{qtyLabel(Number(p.online_qty), p.unit)}</RNText>
                  <Text style={s.sub}>Shop {qtyLabel(Number(p.shop_qty || 0), p.unit)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <RNText style={s.price}>{money(p.price)}</RNText>
                  <RNText style={s.sub}>/{unitLabel(p.unit)}</RNText>
                </View>
                <View style={{ flex: 1.1, alignItems: 'flex-start' }}>
                  <Tag sm t={st === 'inactive' ? 'Inactive' : st === 'out' ? 'Out of stock' : st === 'low' ? 'Low stock' : 'In stock'}
                    kind={st === 'out' || st === 'inactive' ? 'r' : st === 'low' ? 'y' : 'g'} />
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    <TouchableOpacity onPress={() => setEdit(p)}><Text style={s.link}>Edit</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => menu(p)}><RNText style={{ color: MUTE, fontSize: 18 }}>⋯</RNText></TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ height: 30 }} />
      </ScrollView>
      {(addOpen || edit) && (
        <ProductForm
          shop={shop}
          product={edit}
          onClose={() => { setEdit(null); setAddOpen(false); }}
          onDone={done}
        />
      )}
    </View>
  );
}
// ---------- Seller: Payment Account sheet (UPI ID + QR code) ----------
function PaymentSheet({ shop, initial, onClose, onSaved }) {
  const startQr = initial && initial.qr_url ? String(initial.qr_url) : '';
  const [upi, setUpi] = useState(initial && initial.upi_id ? String(initial.upi_id) : '');
  const [qrData, setQrData] = useState(startQr.indexOf('data:') === 0 ? startQr : '');
  const [qrLink, setQrLink] = useState(startQr && startQr.indexOf('data:') !== 0 ? startQr : '');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const preview = qrData || qrLink.trim();
  const upload = async () => {
    setMsg('');
    try {
      const d = await pickQrImage();
      if (d) { setQrData(d); setQrLink(''); }
    } catch (e) { setMsg(e.message || 'Could not open the gallery'); }
  };
  const save = async () => {
    if (busy) return;
    const u = upi.trim();
    const link = qrLink.trim();
    const qr = qrData || link;
    if (!u && !qr) { setMsg('Enter your UPI ID or upload your QR code'); return; }
    if (u && !UPI_RE.test(u)) { setMsg('Enter a valid UPI ID, for example name@upi'); return; }
    if (!qrData && link && !/^https?:\/\//i.test(link)) { setMsg('QR photo link must start with http:// or https://'); return; }
    setBusy(true); setMsg('');
    try {
      await rpc('update_my_payment', { p_shop_id: shop.id, p_upi_id: u || null, p_qr_url: qr || null });
      onSaved({ upi_id: u || null, qr_url: qr || null });
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      <View style={s.rowB}>
        <Text style={s.h}>Payment Account</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: MUTE }}>Close</Text>
        </TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
        <Text style={[s.sub, { marginBottom: 10 }]}>Customers who choose UPI will see this QR code and UPI ID, pay you directly and send you the UTR number.</Text>
        <Field label="UPI ID" value={upi} onChangeText={setUpi} placeholder="yourname@upi" keyboardType="email-address" />
        <Text style={s.label}>QR code</Text>
        <View style={{ alignItems: 'center', marginBottom: 10 }}>
          {preview ? <QrImage url={preview} size={190} /> : (
            <View style={{ width: 190, height: 190, borderRadius: 14, backgroundColor: '#eef3ff',
              alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: LINE }}>
              <RNText style={{ fontSize: 40 }}>🔳</RNText>
              <Text style={[s.sub, { marginTop: 6 }]}>No QR code added</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <Btn kind="o" t={preview ? 'Change QR image' : 'Upload QR image'} style={{ flex: 1 }} onPress={upload} />
          {!!preview && <Btn kind="r" t="Remove" onPress={() => { setQrData(''); setQrLink(''); }} />}
        </View>
        {!qrData && (
          <Field label="Or paste QR photo link (optional)" value={qrLink} onChangeText={setQrLink} placeholder="https://..." />
        )}
      </ScrollView>
      <Msg t={msg} />
      <View style={{ height: 8 }} />
      <Btn t={busy ? 'Please wait...' : 'Save'} onPress={save} disabled={busy} style={{ minHeight: 50 }} />
    </Sheet>
  );
}

// ---------- Seller: More tab = seller profile (new design, same flow) ----------
function SellerMore({ shop, setShop, lang, onLang, onLogout }) {
  const [vib, setVib] = useState(PREF.vib);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ upi_id: shop.upi_id || null, qr_url: shop.qr_url || null });
  const [pmsg, setPmsg] = useState('');
  const soon = (t) => Alert.alert(trs(t), trs('Coming soon'));
  const toggleVib = (v) => { PREF.vib = v; setVib(v); };
  const langName = (LANGS.find((l) => l[0] === lang) || LANGS[0])[1];

  // load the saved UPI ID / QR code of this shop
  useEffect(() => {
    let dead = false;
    rpc('get_shop_payment', { p_shop_id: shop.id })
      .then((r) => {
        const x = Array.isArray(r) ? r[0] : r;
        if (!dead && x && typeof x === 'object') setPay({ upi_id: x.upi_id || null, qr_url: x.qr_url || null });
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [shop.id]);

  const hasPay = !!(pay.upi_id || pay.qr_url);
  const saved = (p) => {
    setPay(p); setPayOpen(false); setPmsg('✅ Saved');
    if (setShop) setShop({ ...shop, upi_id: p.upi_id, qr_url: p.qr_url });
  };
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      {/* hero */}
      <View style={[s.head, { paddingBottom: 70, alignItems: 'center' }]}>
        <View style={{ borderWidth: 3, borderColor: LIME, borderRadius: 45, padding: 2 }}>
          <Photo url={shop.photo_url} name={shop.name} size={80} round />
        </View>
        <RNText style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 12 }} numberOfLines={1}>
          {shop.name + ' ✔'}
        </RNText>
        <RNText style={{ color: '#cfdcf7', marginTop: 4 }} numberOfLines={1}>{shop.category + ' · ' + shop.area}</RNText>
        <View style={[s.pill, { backgroundColor: shop.is_open ? '#dcf5e1' : '#fbe0db', marginTop: 10 }]}>
          <Text style={{ fontWeight: '800', color: shop.is_open ? '#0a6b3f' : '#9a2314' }}>{shop.is_open ? '● Open' : '● Closed'}</Text>
        </View>
      </View>

      {/* payment account card (overlapping the hero) */}
      <View style={[s.card, { marginTop: -48, padding: 18 }]}>
        <View style={s.rowB}>
          <Text style={s.h}>Payment Account</Text>
          <Tag t={hasPay ? 'Published' : 'Empty'} kind={hasPay ? 'g' : 'y'} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {pay.qr_url ? <QrImage url={pay.qr_url} size={78} /> : (
            <View style={[s.mic, { backgroundColor: '#e6e8ff', width: 78, height: 78, borderRadius: 14 }]}>
              <RNText style={{ fontSize: 34 }}>🔳</RNText>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.sub}>UPI ID</Text>
            <RNText style={{ color: INK, fontWeight: '800', fontSize: 16, marginTop: 2 }} numberOfLines={1}>
              {pay.upi_id || '—'}
            </RNText>
            <Text style={[s.sub, { marginTop: 6 }]}>Customers pay you directly and send the UTR number.</Text>
          </View>
        </View>
        <Msg t={pmsg} ok={pmsg.startsWith('✅')} />
        <View style={{ height: 10 }} />
        <Btn t={hasPay ? 'Edit UPI ID & QR code' : 'Add UPI ID & QR code'} onPress={() => { setPmsg(''); setPayOpen(true); }}
          style={{ minHeight: 48 }} />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 0 }]}>Shop Management</Text>
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <MenuRow ic="🏪" bg="#e3ecff" title="Manage Your Shop" sub="Update shop details, address, and information" onPress={() => soon('Manage Your Shop')} />
        <MenuRow ic="🕒" bg="#fff0d6" title="Business Hours" sub="Set open hours and holidays" onPress={() => soon('Business Hours')} />
        <MenuRow ic="🚚" bg="#d9f8ec" title="Delivery and Pickup" sub="Manage delivery zones and pickup options" onPress={() => soon('Delivery and Pickup')} />
        <MenuRow ic="💳" bg="#e6e8ff" title="Payment Account" sub="Manage UPI ID and payment QR code" onPress={() => { setPmsg(''); setPayOpen(true); }} last />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 0 }]}>Products & Sales</Text>
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <MenuRow ic="🗂️" bg="#e3ecff" title="Categories" sub="Manage your product categories" onPress={() => soon('Categories')} />
        <MenuRow ic="📦" bg="#d9f6ff" title="Inventory" sub="Track stock and manage inventory" onPress={() => soon('Inventory')} />
        <MenuRow ic="🏷️" bg="#fde4ea" title="Deals and Offers" sub="Create and manage deals and discounts" onPress={() => soon('Deals and Offers')} />
        <MenuRow ic="📈" bg="#e1f7e3" title="Sales Report" sub="View sales performance and reports" onPress={() => soon('Sales Report')} />
        <MenuRow ic="⭐" bg="#fff3c4" title="Customers Reviews" sub="View and respond to customer reviews" onPress={() => soon('Customers Reviews')} last />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 8 }]}>Support & Account</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
        paddingHorizontal: 14 }}>
        <ProfTile ic="🌐" bg="#e3ecff" title="Language" sub={langName} onPress={() => onLang('pick')} />
        <ProfTile ic="🎧" bg="#dcf5e9" title="Customer Support" sub="Get help and support" onPress={() => soon('Customer Support')} />
        <ProfTile ic="🔔" bg="#fff0d6" title="Notification" sub={vib ? 'New order alert (vibration): On' : 'New order alert (vibration): Off'}
          onPress={() => toggleVib(!vib)} />
        <ProfTile ic="↪" bg="#fdecef" title="Log Out" sub="Logout from your seller account" onPress={onLogout} danger />
      </View>

      <View style={{ height: 30 }} />
      {payOpen && (
        <PaymentSheet shop={shop} initial={pay} onClose={() => setPayOpen(false)} onSaved={saved} />
      )}
    </ScrollView>
  );
}

// ======================================================================
// TAB BAR
// ======================================================================
function TabBar({ tabs, cur, onPick }) {
  return (
    <View style={s.tabbar}>
      {tabs.map(([k, ic, label, badge]) => (
        <TouchableOpacity key={k} style={s.tab} onPress={() => onPick(k)} activeOpacity={0.7}>
          <View>
            <RNText style={{ fontSize: 22, opacity: cur === k ? 1 : 0.55 }}>{ic}</RNText>
            {!!badge && <View style={s.badge}><RNText style={s.badgeT}>{badge}</RNText></View>}
          </View>
          <Text style={[s.tabT, cur === k && { color: BLUE, fontWeight: '800' }]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ======================================================================
// SELLER APP (Partner Hub)
// ======================================================================
function SellerApp({ shop, setShop, lang, onLang, onLogout }) {
  const [tab, setTab] = useState('dash');
  const [selId, setSelId] = useState(null);
  const [products, setProducts] = useState([]);
  const [perr, setPerr] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const { os, load, err: oerr, alertMsg, clearAlert, hasMore, loadMore } = useOrders(shop.id);
  // seller's own products (works even when the shop is closed)
  const reloadP = useCallback(() => {
    rpc('seller_get_products', { p_shop_id: shop.id })
      .then((r) => { setProducts(unwrapList(r)); setPerr(''); })
      .catch((e) => setPerr(errMsg(e)));
  }, [shop.id]);
  useEffect(() => { reloadP(); }, [reloadP]);
  const newCount = os.filter((o) => o.status === 'new').length;
  const pick = (k) => {
    if (k === 'add') { setTab('products'); setAddOpen(true); return; }
    setSelId(null); setTab(k);
  };
  const goTab = (k) => { setSelId(null); setTab(k); };
  const openOrder = (id) => { setTab('orders'); setSelId(id); };
  let body = null;
  if (tab === 'dash') {
    body = <SellerDash shop={shop} setShop={setShop} os={os} products={products}
      goTab={goTab} openOrder={openOrder} reloadP={reloadP} ordersErr={oerr} />;
  } else if (tab === 'orders') {
    body = <SellerOrders os={os} load={load} selId={selId} setSel={setSelId} err0={oerr}
      hasMore={hasMore} loadMore={loadMore} />;
  } else if (tab === 'products') {
    body = <SellerProducts shop={shop} products={products} reloadP={reloadP}
      addOpen={addOpen} setAddOpen={setAddOpen} perr={perr} />;
  } else {
    body = <SellerMore shop={shop} setShop={setShop} lang={lang} onLang={onLang} onLogout={onLogout} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {!!alertMsg && (
        <TouchableOpacity style={s.alertBar} onPress={() => { clearAlert(); setSelId(null); setTab('orders'); }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{alertMsg}</Text>
          <Text style={{ color: '#fff' }}>Tap to view</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>{body}</View>
      <TabBar
        cur={tab}
        onPick={pick}
        tabs={[
          ['dash', '📊', 'Dashboard'],
          ['orders', '📋', 'Orders', newCount > 0 ? newCount : null],
          ['add', '➕', 'Add'],
          ['products', '📦', 'Products'],
          ['more', '⋯', 'More'],
        ]}
      />
    </View>
  );
}

// ======================================================================
// APP
// ======================================================================
export default function App() {
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(null);
const [authForgot, setAuthForgot] = useState(false);
const handledLinks = useRef({});
  const [splashDone, setSplashDone] = useState(false);
  const [lang, setLang] = useState('en');
  const [langPick, setLangPick] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfileS] = useState({ name: '', phone: '', address: '' });
  const [loc, setLocS] = useState(null);
  const [locOpen, setLocOpen] = useState(false);
  const [authRole, setAuthRole] = useState(null); // null | 'buyer' | 'seller'
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('home');
  const [shopSel, setShopSel] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [catInit, setCatInit] = useState(null);
  const [cart, setCart] = useState(null);
  const [done, setDone] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [myShopErr, setMyShopErr] = useState('');
  LANG = lang;

  // the role comes from the database (profiles.role), saved into the session after login / restore
  const isSeller = !!(session && session.role === 'seller');

  // called by the API layer when the refresh token is no longer valid
  ON_EXPIRED = () => {
    setSession(null); setMyShop(null); setCart(null); setDone(null); setShopSel(null); setTab('home');
    Alert.alert('Session expired', 'Please log in again.');
  };

  // ---- splash timer ----
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  // ---- boot: restore saved data (+ refresh an expired access token) ----
  useEffect(() => {
    (async () => {
      const l = await store.get('lang');
      const ss = await store.get('session');
      const pr = await store.get('profile');
      const lc = await store.get('loc');
      if (l) { LANG = l; setLang(l); }
      if (pr) { try { setProfileS(JSON.parse(pr)); } catch (e) {} }
      if (lc) { try { setLocS(JSON.parse(lc)); } catch (e) {} }
      if (ss) {
        try {
          SESSION = JSON.parse(ss);
          if (SESSION && SESSION.expires_at && Date.now() > SESSION.expires_at - 30000) {
            try { await tryRefresh(); } catch (e) { /* offline: keep session, retry on next request */ }
          }
          if (SESSION) setSession(SESSION);
        } catch (e) { SESSION = null; }
      }
      setReady(true);
    })();
  }, []);
  // Register device for push notifications after login
useEffect(() => {
  if (!ready || !session || !session.uid) return;

  registerPushToken().catch((e) => {
    console.log('Push registration error:', e);
  });
}, [ready, session && session.uid]);

// ---- password recovery deep link handler ----
useEffect(() => {
  let active = true;

  const handleRecoveryUrl = async (url) => {
    if (!active || !url || handledLinks.current[url]) return;

    handledLinks.current[url] = true;

    try {
      const parsed = ExLink.parse(url);
      const params = parsed.queryParams || {};

      if (params.error || params.error_description) {
        Alert.alert(
          'Password Reset',
          params.error_description || params.error || 'Password reset link is invalid.'
        );
        return;
      }

      const code = params.code;

      if (!code) return;

      const verifier = await loadVerifier();

      if (!verifier) {
        Alert.alert(
          'Password Reset',
          'Reset session expired. Please request a new password reset link.'
        );
        return;
      }

      const tokenData = await raw('/auth/v1/token?grant_type=pkce', {
        method: 'POST',
        body: {
          auth_code: code,
          code_verifier: verifier,
        },
      });

      if (!active) return;

      if (!tokenData || !tokenData.access_token) {
        throw new Error('Could not verify reset link. Please request a new one.');
      }

      await clearVerifier();

      if (active) {
        setAuthForgot(false);
        setRecovery(tokenData);
      }
    } catch (e) {
      if (active) {
        Alert.alert(
          'Password Reset',
          authErrMsg(e) || 'Reset link could not be verified. Please try again.'
        );
      }
    }
  };

  const subscription = ExLink.addEventListener('url', ({ url }) => {
    handleRecoveryUrl(url);
  });

  ExLink.getInitialURL()
    .then((url) => {
      if (url) handleRecoveryUrl(url);
    })
    .catch(() => {});

  return () => {
    active = false;
    subscription?.remove();
  };
}, []);

  // ---- shops + products (public read, RLS decides what is visible) ----
  const loadAll = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const sh = unwrapList(await shopRpc('list'));
      const pr = await api('/rest/v1/products?active=eq.true&select=*&order=name&limit=60');
      setShops(sh); setProducts(withShopNames(pr || [], sh));
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);
  useEffect(() => { if (ready) loadAll(); }, [ready, loadAll]);

  // ---- my shop: loaded ONLY for seller accounts ----
  useEffect(() => {
    if (!session || session.role !== 'seller') { setMyShop(null); setMyShopErr(''); return; }
    setMyShop(undefined); setMyShopErr('');
    shopRpc('mine')
      .then((r0) => { const r = Array.isArray(r0) ? r0[0] : r0; setMyShop(r && r.id ? r : null); })
      .catch((e) => { setMyShopErr(errMsg(e)); setMyShop(null); });
  }, [session && session.uid, session && session.role]);

  // ---- profile helpers ----
  const applyProfileData = (p) => {
    if (!p) return;
    setProfileS((prev) => {
      const np = { name: p.name || prev.name || '', phone: p.phone || prev.phone || '',
        address: p.address || prev.address || '' };
      store.set('profile', JSON.stringify(np));
      return np;
    });
    if (p.area) {
      setLocS((prev) => {
        if (prev && prev.area) return prev;
        const nl = { area: p.area, full: typeof p.location === 'string' ? p.location : '' };
        store.set('loc', JSON.stringify(nl));
        return nl;
      });
    }
  };
  const fetchProfile = fetchProfileRow;
  // update_my_profile writes role 'buyer', so it is used for BUYER accounts only.
  // A seller account never calls it (the seller row is written by ensureSellerProfile).
  const syncRemote = (p, l) => {
    if (!SESSION || SESSION.role === 'seller') return Promise.resolve(null);
    return rpc('update_my_profile', {
      p_name: (p.name || '').trim() || null,
      p_phone: (p.phone || '').trim() || null,
      p_location: l ? (l.full || l.area || null) : null,
      p_area: l && l.area ? l.area : null,
      p_address: (p.address || '').trim() || null,
    });
  };
  // load profile (and the role stored in the database) after a restored session
  useEffect(() => {
    if (!ready || !session) return;
    let dead = false;
    fetchProfile(session.uid).then((p) => {
      if (dead || !p) return;
      applyProfileData(p);
      if (p.role) {
        const role = p.role === 'seller' ? 'seller' : 'buyer';
        if (SESSION && SESSION.role !== role) {
          SESSION = { ...SESSION, role }; setSession(SESSION); store.set('session', JSON.stringify(SESSION));
        }
      }
    }).catch(() => {});
    return () => { dead = true; };
  }, [ready, session && session.uid]);

  // ---- handlers ----
  const pickLang = (k) => { LANG = k; setLang(k); store.set('lang', k); setLangPick(false); };
  const setProfile = (p) => { setProfileS(p); store.set('profile', JSON.stringify(p)); };
  const saveProfile = async (p) => {
    setProfile(p);
    if (!SESSION) return '';
    try { await syncRemote(p, loc); return ''; } catch (e) { return errMsg(e); }
  };
  const saveLoc = (l) => {
    setLocS(l); store.set('loc', JSON.stringify(l));
    let np = profile;
    if (l.full && !profile.address) { np = { ...profile, address: l.full }; setProfile(np); }
    if (SESSION) syncRemote(np, l).catch(() => {});
    setLocOpen(false);
  };
  // Called after a REAL Supabase session exists (login, or signup without email confirmation).
  // The role is decided from the database, never from user_metadata or from the screen used to log in.
  const onSession = async (sess) => {
    const intent = authRole;
    const metaRole = sess.meta_role;
    const clean = { token: sess.token, refresh: sess.refresh, uid: sess.uid, email: sess.email,
      expires_at: sess.expires_at };
    let full = { ...clean, role: 'buyer' };
    SESSION = full; // needed so that the api() calls below are authenticated

    let p = null;
    try { p = await fetchProfile(clean.uid); } catch (e) { p = null; }
    let role = p && p.role ? (p.role === 'seller' ? 'seller' : 'buyer') : null;

    // Fresh seller account (signed up from "Create a Shop Profile") that has no seller row yet:
    // user_metadata only starts the onboarding, the role itself is then written to the database.
    if (intent === 'seller' && role !== 'seller' && metaRole === 'seller') {
      let hasOrders = true;
      try {
        hasOrders = unwrapList(await rpc('get_my_orders_paginated', { p_limit: 1, p_offset: 0 })).length > 0;
      } catch (e) { hasOrders = true; }
      if (!hasOrders) {
        try {
          await ensureSellerProfile(clean.uid, { email: clean.email });
          role = 'seller';
          try { p = (await fetchProfile(clean.uid)) || p; } catch (e) {}
        } catch (e) { Alert.alert('Seller profile', errMsg(e)); }
      }
    }
    // no profile row at all -> a user who already owns a shop is a seller, everybody else is a buyer
    if (!role) {
      try {
        let sh = await shopRpc('mine');
        if (Array.isArray(sh)) sh = sh[0];
        role = sh && sh.id ? 'seller' : 'buyer';
      } catch (e) { role = 'buyer'; }
    }
    if (intent === 'seller' && role !== 'seller') {
      Alert.alert('Buyer account', 'This is a buyer account. Please use a seller account for the Partner Hub.');
    }
    full = { ...full, role };
    SESSION = full;
    setSession(full); store.set('session', JSON.stringify(full)); setAuthRole(null);
    if (p) applyProfileData(p);
    setTab(role === 'seller' ? 'home' : tab);
  };
  const logout = () => {
    const tk = SESSION && SESSION.token;
    if (tk) raw('/auth/v1/logout', { method: 'POST' }, tk).catch(() => {});
    SESSION = null; setSession(null); store.del('session');
    // clear the saved account details so the next account (buyer or seller) never sees them
    setProfileS({ name: '', phone: '', address: '' }); store.del('profile');
    setMyShop(null); setMyShopErr(''); setAuthRole(null); setCart(null); setDone(null); setShopSel(null); setTab('home');
    loadAll();
  };
  const addToCart = (shop, p, qty) => {
    const put = (base) => setCart({ shop, items: { ...base, [p.id]: { p, qty } } });
    if (cart && cart.shop.id !== shop.id) {
      Alert.alert(trs('Different shop'), trs('Your cart has items from another shop. Clear it?'), [
        { text: trs('No'), style: 'cancel' },
        { text: trs('Yes'), onPress: () => put({}) },
      ]);
    } else put(cart ? cart.items : {});
  };
  const reorder = async (o) => {
    try {
      const ps = await api('/rest/v1/products?shop_id=eq.' + o.shop_id + '&active=eq.true&select=*');
      const items = {};
      (o.order_items || []).forEach((i) => {
        const p = (ps || []).find((x) => x.id === i.product_id) || (ps || []).find((x) => x.name === i.name);
        if (p && Number(p.online_qty) > 0) items[p.id] = { p, qty: Math.min(Number(i.qty), Number(p.online_qty)) };
      });
      if (!Object.keys(items).length) { Alert.alert(trs('Reorder'), trs('Products not available')); return; }
      let shop = shops.find((x) => x.id === o.shop_id);
      if (!shop) { const r = unwrapList(await shopRpc('list')); shop = r.find((x) => x.id === o.shop_id); }
      if (!shop) { Alert.alert(trs('Reorder'), trs('Products not available')); return; }
      setCart({ shop, items }); setShopSel(null); setTab('cart');
    } catch (e) { Alert.alert('Error', errMsg(e)); }
  };
  const openShop = (x) => { setFocusId(null); setShopSel(x); };
  const openProduct = (p) => {
    const sh = shops.find((x) => x.id === p.shop_id);
    if (sh) { setFocusId(p.id); setShopSel(sh); }
  };
  const goTab = (k) => { setShopSel(null); setDone(null); setTab(k); };

  // ---- screens ----
  if (!ready || !splashDone) return <Splash />;

  if (langPick) {
    return <LangScreen current={lang} onPick={pickLang} onClose={() => setLangPick(false)} />;
  }
  
if (recovery) {
  return (
    <ResetPassword
      recovery={recovery}
      onDone={() => {
        setRecovery(null);
        setAuthRole(null);
        setAuthForgot(false);
      }}
    />
  );
}


  // login screen (buyer login or seller login)
  if (authRole && !session) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BLUE }}>
        <StatusBar barStyle="light-content" backgroundColor={BLUE} />
        <AuthScreen
  role={authRole}
  onSession={onSession}
  onClose={() => setAuthRole(null)}
  initialForgot={authForgot}
/>
      </SafeAreaView>
    );
  }

  // SELLER ACCOUNT -> only Partner Hub (buyer screens are never shown)
  if (isSeller) {
    if (myShop === undefined) {
      return (
        <View style={{ flex: 1, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' }}>
          <StatusBar barStyle="light-content" backgroundColor={DARK} />
          <ActivityIndicator color="#fff" />
        </View>
      );
    }
    if (!myShop) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: BLUE }}>
          <StatusBar barStyle="light-content" backgroundColor={BLUE} />
          <SellerSetupScreen
            defaultArea={loc && loc.area}
            onCreated={(sh) => { setMyShop(sh); loadAll(); }}
            onLogout={logout}
            loadErr={myShopErr}
          />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BLUE }}>
        <StatusBar barStyle="light-content" backgroundColor={BLUE} />
        <SellerApp
          shop={myShop}
          setShop={setMyShop}
          lang={lang}
          onLang={() => setLangPick(true)}
          onLogout={logout}
        />
      </SafeAreaView>
    );
  }

  // GUEST / BUYER
  const cartCount = cart && cart.items ? Object.keys(cart.items).length : 0;
  let body;
  if (done) {
    body = <Success done={done} onTrack={() => { setDone(null); setTab('orders'); }}
      onHome={() => { setDone(null); setTab('home'); }} />;
  } else if (shopSel) {
    body = <ShopScreen key={shopSel.id} shop={shopSel} focusId={focusId} cart={cart}
      onBack={() => { setShopSel(null); setFocusId(null); }}
      onAdd={addToCart}
      onCart={() => { setShopSel(null); setTab('cart'); }} />;
  } else if (tab === 'home') {
    body = <Home shops={shops} products={products} loading={loading} err={err} loc={loc}
      onLoc={() => setLocOpen(true)} onShop={openShop} onProduct={openProduct} onReload={loadAll}
      onMenu={() => setTab('cats')}
      onBell={() => Alert.alert(trs('Notification'), trs('Coming soon'))}
      onProfile={() => setTab('profile')} onCats={() => setTab('cats')}
      onCat={(k) => { setCatInit(k); setTab('cats'); }} />;
  } else if (tab === 'cats') {
    body = <Categories shops={shops} onShop={openShop} initial={catInit} clearInitial={() => setCatInit(null)} />;
  } else if (tab === 'cart') {
    body = <CartScreen cart={cart} setCart={setCart} session={session} needLogin={() => setAuthRole('buyer')}
      profile={profile} setProfile={setProfile}
      syncProfile={() => { if (SESSION) syncRemote(profile, loc).catch(() => {}); }}
      onDone={(d) => { setDone(d); setCart(null); loadAll(); }} />;
  } else if (tab === 'orders') {
    body = <BuyerOrders session={session} needLogin={() => setAuthRole('buyer')} onReorder={reorder} />;
  } else {
    body = <Profile session={session} needLogin={() => setAuthRole('buyer')}
      onPartner={() => setAuthRole('seller')} onLogout={logout} onOrders={() => setTab('orders')}
      lang={lang} onLang={() => setLangPick(true)} profile={profile} onSaveProfile={saveProfile}
      loc={loc} onLoc={() => setLocOpen(true)} />;
  }
  const showTabs = !done && !shopSel;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BLUE }}>
      <StatusBar barStyle="light-content" backgroundColor={BLUE} />
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1 }}>{body}</View>
        {showTabs && (
          <TabBar
            cur={tab}
            onPick={goTab}
            tabs={[
              ['home', '🏠', 'Home'],
              ['cats', '🗂️', 'Categories'],
              ['cart', '🛒', 'Cart', cartCount > 0 ? cartCount : null],
              ['orders', '📦', 'Orders'],
              ['profile', '👤', 'Profile'],
            ]}
          />
        )}
      </View>
      {locOpen && <LocSheet loc={loc} onClose={() => setLocOpen(false)} onSave={saveLoc} />}
    </SafeAreaView>
  );
}

// ======================================================================
// STYLES
// ======================================================================
const s = StyleSheet.create({
  rowB: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  head: { backgroundColor: BLUE, padding: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16 },
  headT: { color: '#fff', fontSize: 26, fontWeight: '800', marginTop: 8 },
  hello: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 14 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, marginHorizontal: 14, marginTop: 12,
    borderWidth: 1, borderColor: LINE },
  h: { fontSize: 17, fontWeight: '800', color: INK, marginBottom: 8 },
  sub: { color: MUTE, fontSize: 12 },
  label: { color: MUTE, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: INK, backgroundColor: '#fff', marginBottom: 8 },
  btn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnS: { paddingVertical: 7, paddingHorizontal: 14, minHeight: 34, borderRadius: 10 },
  btnO: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BLUE },
  btnR: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: RED },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: LINE, marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  chipT: { color: INK, fontWeight: '700', fontSize: 13 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    fontSize: 12, fontWeight: '800', overflow: 'hidden' },
  tagS: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 2 },
  msg: { marginHorizontal: 14, marginTop: 10, padding: 10, borderRadius: 12 },
  mrow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  mrowLine: { borderBottomWidth: 1, borderBottomColor: LINE },
  mic: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shopN: { fontSize: 15, fontWeight: '800', color: INK },
  overlay: { flex: 1, backgroundColor: 'rgba(10,20,50,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18,
    paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#d5dcea',
    marginBottom: 12 },
  shopCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18,
    padding: 12, marginBottom: 10, borderWidth: 1, borderColor: LINE },
  offer: { color: ORANGE, fontWeight: '700', marginTop: 4, fontSize: 12 },
  mini: { width: '48.5%', backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: LINE },
  miniN: { fontSize: 14, fontWeight: '800', color: INK },
  arrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e8f0ff', alignItems: 'center',
    justifyContent: 'center' },
  avatarS: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 12, marginTop: 14, gap: 8 },
  searchIn: { flex: 1, paddingVertical: 11, fontSize: 14, color: INK },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },
  tile: { width: '23%', aspectRatio: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10 },
  tileT: { fontSize: 10, fontWeight: '700', color: INK, marginTop: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e9f1ff', borderRadius: 18,
    padding: 16, marginHorizontal: 14, marginTop: 12 },
  empty: { color: MUTE, textAlign: 'center', padding: 20 },
  pcard: { width: '48.5%', backgroundColor: '#fff', borderRadius: 16, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: LINE },
  price: { color: GREEN, fontWeight: '800', fontSize: 15 },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  cartBar: { position: 'absolute', left: 14, right: 14, bottom: 14, backgroundColor: GREEN, borderRadius: 16,
    padding: 16, flexDirection: 'row', justifyContent: 'space-between' },
  cartBarT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  totalBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: BG, borderRadius: 14, padding: 12, marginVertical: 12 },
  okOuter: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#d9f3e3', alignItems: 'center',
    justifyContent: 'center' },
  okInner: { width: 84, height: 84, borderRadius: 42, backgroundColor: GREEN, alignItems: 'center',
    justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#c3cde2',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  profTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, backgroundColor: '#fff' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: BLUE, alignItems: 'center',
    justifyContent: 'center' },
  bizCard: { borderRadius: 24, marginHorizontal: 14, marginTop: 14, padding: 20 },
  bizTitle: { fontSize: 25, fontWeight: '800', color: INK, lineHeight: 31 },
  bizText: { fontSize: 15, color: INK, marginTop: 8, lineHeight: 21 },
  bizBtn: { backgroundColor: '#fff', borderRadius: 18, minHeight: 56, marginTop: 16, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bizBtnT: { color: BLUE, fontSize: 18, fontWeight: '800' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  adBox: { backgroundColor: BLUE, borderRadius: 14, padding: 14, marginBottom: 10 },
  billRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1,
    borderTopColor: LINE },
  sdot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#c3cde2',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  abtn: { width: '48.5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginBottom: 8 },
  thead: { flexDirection: 'row', backgroundColor: '#eef3ff', paddingVertical: 8, paddingHorizontal: 6,
    borderRadius: 10 },
  th: { fontSize: 11, fontWeight: '800', color: MUTE },
  trow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: LINE },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: LINE,
    paddingVertical: 6 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabT: { fontSize: 10, color: MUTE, marginTop: 2, fontWeight: '600' },
  badge: { position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  alertBar: { backgroundColor: GREEN, padding: 12, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center' },
});
