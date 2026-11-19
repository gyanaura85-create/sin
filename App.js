/*
 * NearKart — "Your neighbourhood, your marketplace."
 * Single-file Expo / React Native app (Supabase backend, RPC based, RLS safe)
 *
 * INSTALL (once):
 *   npx expo install @react-native-async-storage/async-storage expo-location expo-image-picker
 *   npx expo install expo-crypto expo-linking expo-notifications expo-device
 *   (expo-image-picker is needed for shop photo, product photo and QR upload)
 *   (expo-crypto + expo-linking are needed for Forgot Password, expo-notifications + expo-device for push)
 *
 * NEW IN THIS VERSION
 *  - Custom splash screen removed (set the native splash image in app.json).
 *  - Language selection is available ONLY inside Profile (no language screen at app launch).
 *  - Seller can upload SHOP PROFILE PHOTO from gallery (More -> tap the photo, or Manage Your Shop)
 *  - Seller can upload PRODUCT PHOTO from gallery (photo link field removed). Buyers see the photo.
 *  - A seller can sell MANY categories in one shop. Categories are saved in shops.category as "Grocery,Fashion".
 *    Buyer Categories / filters / shop cards show the shop under every category it sells.
 *  - Every page under Profile / More is now a real, colourful page (no more "Coming soon").
 *  - Buyer NOTIFICATIONS: order updates, shop offers, new products, "rate your order" feedback.
 *  - Seller NOTIFICATIONS: new orders, low stock, vibration alert.
 *  - Feedback / reviews: buyer rates a delivered order (1-5 stars + comment). Shop rating updates automatically.
 *  - Customer Support page: email + phone.
 *  - Khata (pay later): shop side Khata Management and buyer side My Khata pages.
 *    The Khata database function names / parameter names are all kept in ONE place: the KHATA block below.
 *
 * ======================================================================
 * RUN THIS SQL ONCE in the Supabase SQL editor (new functions only, nothing is deleted).
 * (The payment / seller-profile SQL from the previous version stays the same.)
 * ======================================================================
 *
 * alter table shops add column if not exists photo_url text;
 *
 * create or replace function update_my_shop_photo(p_shop_id uuid, p_photo_url text) returns json
 * language plpgsql security definer set search_path = public as $$
 * begin
 *   update shops set photo_url = nullif(trim(p_photo_url), '') where id = p_shop_id and owner_id = auth.uid();
 *   if not found then raise exception 'You are not allowed to change this shop'; end if;
 *   return json_build_object('photo_url', p_photo_url);
 * end; $$;
 *
 * create or replace function update_my_shop_categories(p_shop_id uuid, p_category text) returns json
 * language plpgsql security definer set search_path = public as $$
 * begin
 *   if p_category is null or length(trim(p_category)) = 0 then raise exception 'Select at least one category'; end if;
 *   update shops set category = trim(p_category) where id = p_shop_id and owner_id = auth.uid();
 *   if not found then raise exception 'You are not allowed to change this shop'; end if;
 *   return json_build_object('category', p_category);
 * end; $$;
 *
 * create table if not exists shop_reviews (
 *   id uuid primary key default gen_random_uuid(),
 *   shop_id uuid not null, order_id uuid not null unique, user_id uuid not null,
 *   rating int not null check (rating between 1 and 5), comment text, customer_name text,
 *   created_at timestamptz not null default now());
 * alter table shop_reviews enable row level security;
 *
 * create or replace function submit_review(p_order uuid, p_rating int, p_comment text) returns json
 * language plpgsql security definer set search_path = public as $$
 * declare v_shop uuid; v_name text; v_status text;
 * begin
 *   if auth.uid() is null then raise exception 'Not authenticated'; end if;
 *   if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'Rating must be 1 to 5'; end if;
 *   select shop_id, customer_name, status into v_shop, v_name, v_status from orders where id = p_order and user_id = auth.uid();
 *   if v_shop is null then raise exception 'Order not found'; end if;
 *   if v_status <> 'delivered' then raise exception 'You can review only delivered orders'; end if;
 *   insert into shop_reviews (shop_id, order_id, user_id, rating, comment, customer_name)
 *   values (v_shop, p_order, auth.uid(), p_rating, nullif(trim(p_comment), ''), v_name);
 *   update shops s set
 *     rating = (select round(avg(rating)::numeric, 1) from shop_reviews where shop_id = v_shop),
 *     rating_count = (select count(*) from shop_reviews where shop_id = v_shop)
 *   where s.id = v_shop;
 *   return json_build_object('ok', true);
 * end; $$;
 *
 * create or replace function get_shop_reviews(p_shop_id uuid) returns json
 * language sql security definer set search_path = public as $$
 *   select coalesce((select json_agg(r) from (
 *     select order_id, rating, comment, customer_name, created_at from shop_reviews
 *     where shop_id = p_shop_id order by created_at desc limit 50) r), '[]'::json);
 * $$;
 *
 * create or replace function get_my_reviews() returns json
 * language sql security definer set search_path = public as $$
 *   select coalesce((select json_agg(r) from (
 *     select order_id, rating, comment from shop_reviews where user_id = auth.uid()) r), '[]'::json);
 * $$;
 *
 * grant execute on function update_my_shop_photo(uuid, text) to authenticated;
 * grant execute on function update_my_shop_categories(uuid, text) to authenticated;
 * grant execute on function submit_review(uuid, int, text) to authenticated;
 * grant execute on function get_shop_reviews(uuid) to anon, authenticated;
 * grant execute on function get_my_reviews() to authenticated;
 *
 * NOTE: if your shops.category column has a CHECK constraint with a single allowed value, remove it
 * (the app now stores a comma separated list such as "Grocery,Fashion").
 * NOTE: photos are stored as small compressed data: images inside the database text columns
 * (shops.photo_url, products.image_url, shops.qr_url). For a big production launch move them to Supabase Storage.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Animated, View, Text as RNText, TextInput as RNTextInput, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, StatusBar, RefreshControl, Modal, Alert, Vibration, Image,
  Linking, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';

// ======================================================================
// CONFIG  (only the project URL and the public publishable key - never a service-role key)
// ======================================================================
const URL_ = 'https://mfdiicegsgbcbvyeuxgi.supabase.co';
const KEY = 'sb_publishable_I_ypFDUGPQdtct0U5FMhAQ_02rIepBx';
const PAGE = 20;        // buyer orders page size
const SPAGE = 20;       // seller orders page size
const SUPPORT_EMAIL = 'ssupportnearkert@gmail.com';
const SUPPORT_PHONE = '8144937920';

const BLUE = '#0b4fc2', DARK = '#0a3a99', INK = '#0b1f4d', MUTE = '#5b6a86';
const BG = '#f6f8fc', LINE = '#dbe3f3', GREEN = '#067a4e', RED = '#c81e4a', LIME = '#6fdc7d', ORANGE = '#d9730d';
const PURPLE = '#6a3fc2', TEAL = '#0e8f8f', PINK = '#d6336c', AMBER = '#e08a00', GOLD = '#f5a300';

// ----------------------------------------------------------------------
// KHATA database functions: the function names are the ones that exist in Supabase.
// The PARAMETER NAMES below follow the app's p_* naming. If your SQL uses a different parameter
// name, change it here (this is the only place that has to be edited).
//   khata_my_status(p_shop_id)                  -> { status, balance }              (already used by KhataApply)
//   khata_apply(p_shop_id, p_name, p_phone)                                         (already used by KhataApply)
//   khata_shop_accounts(p_shop_id)              -> list of { account_id, customer_name, customer_phone, status, balance, credit_limit }
//   khata_decide(p_account_id, p_approve)       -> approve / reject a customer
//   khata_set_credit_limit(p_account_id, p_limit)
//   khata_record_payment(p_account_id, p_amount, p_note)
//   khata_ledger(p_account_id)                  -> list of { kind: 'order' | 'payment', ref, amount, at, note }
//   khata_my_accounts()                         -> list of { account_id, shop_id, shop_name, status, balance, credit_limit }
// ----------------------------------------------------------------------
const KHATA = {
  shopAccounts: (shopId) => ['khata_shop_accounts', { p_shop_id: shopId }],
  decide: (accId, ok) => ['khata_decide', { p_account: accId, p_approve: ok }],
  setLimit: (accId, v) => ['khata_set_credit_limit', { p_account: accId, p_limit: v }],
  record: (accId, v, note) => ['khata_record_payment', { p_account: accId, p_amount: v, p_note: note || null }],
  ledger: (accId) => ['khata_ledger', { p_account: accId }],
  myAccounts: () => ['khata_my_accounts', {}],
  setReminder: (accId, dueAt, note) => ['khata_set_reminder', { p_account: accId, p_due_at: dueAt, p_note: note || null }],
};

const CATS = [
  { k: 'Grocery', ic: '🧺', bg: '#fff0d6' },
  { k: 'Fashion', ic: '👕', bg: '#e3ecff' },
  { k: 'Electronics', ic: '💻', bg: '#d9f6ff' },
  { k: 'Home', ic: '🛋️', bg: '#e6e8ff' },
  { k: 'Beauty', ic: '💄', bg: '#fde4ea' },
  { k: 'CHICKEN-FISH', ic: '🐟', bg: '#d9f8ec' },
  { k: 'Food', ic: '🍽️', bg: '#fff3c4' },
  { k: 'Sabzi-Phal', ic: '🥬', bg: '#e1f7e3' },
  { k: 'Dudh-Dairy', ic: '🥛', bg: '#e8f1ff' },
];
const SHOP_CATS = CATS.map((c) => c.k);
// product categories: the main shop categories first, then detailed ones
const PROD_CATS = [...SHOP_CATS, 'Atta, Rice & Dal', 'Oil & Ghee', 'Masala', 'Snacks', 'Beverages', 'Dairy', 'Sabzi',
  'Phal', 'Personal Care', 'Home Care', 'Mobile & Accessories', 'Other'];
const UNITS = ['kg', 'litre', 'piece', 'pack'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// a shop can sell many categories: they are stored as "Grocery,Fashion"
const shopCats = (x) => String((x && x.category) || '').split(',').map((c) => c.trim()).filter(Boolean);
const catLabel = (x) => shopCats(x).join(', ');

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
let ImgManip = null;
try { ImgManip = require('expo-image-manipulator'); } catch (e) { ImgManip = null; }
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


// All user-selected photos are converted to JPEG and compressed below 100 KB
// before they are saved in NearKart (shop, product and QR images).
const MAX_PHOTO_BYTES = 100 * 1024;
function base64Bytes(value) {
  const b = String(value || '');
  const padding = b.endsWith('==') ? 2 : b.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b.length * 3) / 4) - padding);
}
async function compressPhotoUnder100KB(uri, originalWidth, originalHeight) {
  if (!ImgManip || !ImgManip.manipulateAsync) {
    throw new Error('Photo compression is unavailable. Install expo-image-manipulator and rebuild the app.');
  }
  const sourceWidth = Number(originalWidth) || 1600;
  const sourceHeight = Number(originalHeight) || sourceWidth;
  const landscape = sourceWidth >= sourceHeight;
  const startSide = Math.min(Math.max(Math.max(sourceWidth, sourceHeight), 320), 1600);
  const qualities = [0.78, 0.70, 0.62, 0.54, 0.46, 0.40, 0.35, 0.30];
  for (let i = 0; i < qualities.length; i += 1) {
    const side = Math.max(320, Math.round(startSide * Math.pow(0.82, i)));
    const resize = landscape
      ? { width: Math.round(side * (sourceWidth / Math.max(sourceWidth, sourceHeight))) }
      : { height: Math.round(side * (sourceHeight / Math.max(sourceWidth, sourceHeight))) };
    const result = await ImgManip.manipulateAsync(
      uri,
      [{ resize }],
      { compress: qualities[i], format: ImgManip.SaveFormat ? ImgManip.SaveFormat.JPEG : 'jpeg', base64: true }
    );
    if (result && result.base64 && base64Bytes(result.base64) < MAX_PHOTO_BYTES) {
      return 'data:image/jpeg;base64,' + result.base64;
    }
  }
  throw new Error('Photo could not be reduced below 100 KB. Please choose another photo.');
}

// Pick an image from the phone gallery
// Returns a compressed data URI (photo binary is always below 100 KB) or null when cancelled.
async function pickImage(opt) {
  const o = opt || {};
  if (!Pick) throw new Error('Image upload is not available. Install expo-image-picker.');
  const perm = await Pick.requestMediaLibraryPermissionsAsync();
  if (!perm || perm.granted === false) throw new Error('Photo permission was not given');
  const r = await Pick.launchImageLibraryAsync({
    mediaTypes: Pick.MediaTypeOptions ? Pick.MediaTypeOptions.Images : ['images'],
    allowsEditing: true,
    ...(o.aspect ? { aspect: o.aspect } : {}),
    quality: 1,
    base64: false,
  });
  if (!r || r.canceled || r.cancelled) return null;
  const asset = r.assets && r.assets[0];
  if (!asset || !asset.uri) throw new Error('Could not read the image. Please try another photo.');
  return compressPhotoUnder100KB(asset.uri, asset.width, asset.height);
}

// Take a photo using the camera, then apply the same strict 100 KB compression.
async function takeImage(opt) {
  const o = opt || {};
  if (!Pick) throw new Error('Image upload is not available. Install expo-image-picker.');
  const perm = await Pick.requestCameraPermissionsAsync();
  if (!perm || perm.granted === false) throw new Error('Camera permission was not given');
  const r = await Pick.launchCameraAsync({
    mediaTypes: Pick.MediaTypeOptions ? Pick.MediaTypeOptions.Images : ['images'],
    allowsEditing: true,
    ...(o.aspect ? { aspect: o.aspect } : {}),
    quality: 1,
    base64: false,
  });
  if (!r || r.canceled || r.cancelled) return null;
  const asset = r.assets && r.assets[0];
  if (!asset || !asset.uri) throw new Error('Could not read the photo. Please try again.');
  return compressPhotoUnder100KB(asset.uri, asset.width, asset.height);
}


// Show Camera or Gallery options
function choosePhoto(opt) {
  return new Promise((resolve, reject) => {
    Alert.alert(
      'Choose Photo',
      'Camera se photo lo ya Gallery se upload karo.',
      [
        {
          text: 'Camera',
          onPress: async () => {
            try {
              resolve(await takeImage(opt));
            } catch (e) {
              reject(e);
            }
          },
        },
        {
          text: 'Gallery',
          onPress: async () => {
            try {
              resolve(await pickImage(opt));
            } catch (e) {
              reject(e);
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => resolve(null),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(null),
      }
    );
  });
}


// QR Code: Gallery only
const pickQrImage = () =>
  pickImage({
    quality: 0.5,
    maxLen: 900000,
  });


// Shop Photo: Camera + Gallery
const pickShopPhoto = () =>
  choosePhoto({
    aspect: [1, 1],
    quality: 0.4,
    maxLen: 450000,
  });


// Product Photo: Camera + Gallery
const pickProductPhoto = () =>
  choosePhoto({
    aspect: [1, 1],
    quality: 0.35,
    maxLen: 300000,
  });


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
  ['Payment Account', 'पेमेंट अकाउंट', 'ପେମେଣ୍ଟ ଆକାଉଣ୍ଟ'],
  ['UPI ID', 'UPI आईडी', 'UPI ଆଇଡି'],
  ['UTR Number', 'UTR नंबर', 'UTR ନମ୍ବର'],
  ['Payment verified', 'भुगतान सत्यापित', 'ପେମେଣ୍ଟ ଯାଞ୍ଚ ହୋଇଛି'],
  ['Pay with UPI', 'UPI से भुगतान करें', 'UPI ରେ ପେମେଣ୍ଟ କରନ୍ତୁ'],
  ['Open UPI app', 'UPI ऐप खोलें', 'UPI ଆପ୍ ଖୋଲନ୍ତୁ'],
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
  ['Establish Your Local Business Presence',
    'अपने लोकल बिज़नेस की पहचान बनाएँ',
    'ଆପଣଙ୍କ ସ୍ଥାନୀୟ ବ୍ୟବସାୟର ପରିଚୟ ତିଆରି କରନ୍ତୁ'],
  ['Create your unique shop profile and connect directly with local customers. A simple process to list your products and take orders.',
    'अपनी दुकान की अनोखी प्रोफ़ाइल बनाएँ और सीधे स्थानीय ग्राहकों से जुड़ें। प्रोडक्ट लिस्ट करने और ऑर्डर लेने की आसान प्रक्रिया।',
    'ଆପଣଙ୍କ ଦୋକାନର ନିଜସ୍ୱ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ ଏବଂ ସିଧାସଳଖ ସ୍ଥାନୀୟ ଗ୍ରାହକଙ୍କ ସହ ଯୋଡ଼ିହୁଅନ୍ତୁ। ପ୍ରଡକ୍ଟ ତାଲିକାଭୁକ୍ତ କରିବା ଓ ଅର୍ଡର ନେବା ପାଇଁ ସହଜ ପ୍ରକ୍ରିୟା।'],
  ['Create a Shop Profile', 'दुकान प्रोफ़ाइल बनाएँ', 'ଦୋକାନ ପ୍ରୋଫାଇଲ୍ ତିଆରି କରନ୍ତୁ'],
  ['Register your shop', 'अपनी दुकान जोड़ें', 'ଆପଣଙ୍କ ଦୋକାନ ଯୋଡ଼ନ୍ତୁ'],
  ['Shop name', 'दुकान का नाम', 'ଦୋକାନର ନାମ'],
  ['Owner name', 'मालिक का नाम', 'ମାଲିକଙ୍କ ନାମ'],
  ['Phone number', 'फ़ोन नंबर', 'ଫୋନ୍ ନମ୍ବର'],
  ['Village / Area', 'गाँव / क्षेत्र', 'ଗାଁ / ଅଞ୍ଚଳ'],
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
  ['Business Hours', 'व्यापार समय', 'ବ୍ୟବସାୟ ସମୟ'],
  ['Delivery and Pickup', 'डिलीवरी और पिकअप', 'ଡେଲିଭରି ଓ ପିକଅପ୍'],
  ['Products & Sales', 'प्रोडक्ट और बिक्री', 'ପ୍ରଡକ୍ଟ ଓ ବିକ୍ରି'],
  ['Support & Account', 'सपोर्ट और अकाउंट', 'ସହାୟତା ଓ ଆକାଉଣ୍ଟ'],
  ['Inventory', 'इन्वेंटरी', 'ଇନଭେଣ୍ଟୋରୀ'],
  ['Deals and Offers', 'डील्स और ऑफ़र', 'ଡିଲ୍ ଓ ଅଫର୍'],
  ['Sales Report', 'बिक्री रिपोर्ट', 'ବିକ୍ରି ରିପୋର୍ଟ'],
  ['Customers Reviews', 'ग्राहक रिव्यू', 'ଗ୍ରାହକ ରିଭ୍ୟୁ'],
  ['Notification', 'नोटिफ़िकेशन', 'ନୋଟିଫିକେସନ୍'],
  ['Notifications', 'नोटिफ़िकेशन', 'ନୋଟିଫିକେସନ୍'],
  ['New order alert (vibration)', 'नए ऑर्डर पर वाइब्रेशन', 'ନୂଆ ଅର୍ଡରରେ ଭାଇବ୍ରେସନ୍'],
  ['Coming soon', 'जल्द आ रहा है', 'ଶୀଘ୍ର ଆସୁଛି'],
  ['No reviews yet.', 'अभी कोई रिव्यू नहीं।', 'ଏପର୍ଯ୍ୟନ୍ତ କୌଣସି ରିଭ୍ୟୁ ନାହିଁ।'],
  ['Your neighbourhood, your marketplace.',
    'आपका मोहल्ला, आपका बाज़ार।',
    'ଆପଣଙ୍କ ପଡ଼ା, ଆପଣଙ୍କ ବଜାର।'],
  ['Loading...', 'लोड हो रहा है...', 'ଲୋଡ୍ ହେଉଛି...'],
  ['Please turn on GPS / Location services',
    'कृपया GPS / लोकेशन चालू करें',
    'ଦୟାକରି GPS / ଲୋକେସନ୍ ଚାଲୁ କରନ୍ତୁ'],
  // new in this version
  ['Rate your order', 'अपने ऑर्डर को रेट करें', 'ଆପଣଙ୍କ ଅର୍ଡରକୁ ରେଟ୍ କରନ୍ତୁ'],
  ['Submit feedback', 'फ़ीडबैक भेजें', 'ଫିଡବ୍ୟାକ୍ ପଠାନ୍ତୁ'],
  ['Customer Reviews', 'ग्राहक रिव्यू', 'ଗ୍ରାହକ ରିଭ୍ୟୁ'],
  ['Contact us', 'हमसे संपर्क करें', 'ଆମ ସହ ଯୋଗାଯୋଗ କରନ୍ତୁ'],
  ['Email us', 'हमें ईमेल करें', 'ଆମକୁ ଇମେଲ୍ କରନ୍ତୁ'],
  ['Call us', 'हमें कॉल करें', 'ଆମକୁ କଲ୍ କରନ୍ତୁ'],
  ['Shop offers', 'दुकान के ऑफ़र', 'ଦୋକାନ ଅଫର୍'],
  ['New products', 'नए प्रोडक्ट', 'ନୂଆ ପ୍ରଡକ୍ଟ'],
  ['Order updates', 'ऑर्डर अपडेट', 'ଅର୍ଡର ଅପଡେଟ୍'],
  ['Sales Report', 'बिक्री रिपोर्ट', 'ବିକ୍ରି ରିପୋର୍ଟ'],
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
    sound:'nearkart_notification.wav',
  });

  await Notif.setNotificationChannelAsync('orders', {
    name: 'NearKart Order Alerts',
    importance: Notif.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    sound:'nearkart_notification.wav',
  });

  await Notif.setNotificationChannelAsync('offers', {
    name: 'NearKart Offers',
    importance: Notif.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 150, 100, 150],
    sound:'nearkart_notification.wav',
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
// new RPCs of this version: friendly message when the SQL at the top of App.js was not run yet
async function newRpc(name, body) {
  try {
    return await rpc(name, body);
  } catch (e) {
    if (isMissingFn(e)) {
      const m = new Error('Database function "' + name + '" is missing. Run the new SQL given at the top of App.js in the Supabase SQL editor.');
      m.missingRpc = true;
      throw m;
    }
    throw e;
  }
}
// Khata RPC helper: takes one of the [name, params] pairs from the KHATA block
const kRpc = (pair) => newRpc(pair[0], pair[1]);
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
      throw new Error('Seller profile could not be saved (database permission). Run the ensure_seller_profile SQL, then try again.');
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
  if (/could not find the function .*(get_shop_payment|update_my_payment|submit_order_utr|get_order_payment|verify_order_payment)/i.test(m)) return 'Payment database functions are missing. Run the payment SQL in the Supabase SQL editor.';
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
const openMail = (a) => { if (a) Linking.openURL('mailto:' + a + '?subject=' + encodeURIComponent('NearKart Support')).catch(() => {
  Alert.alert('Email', 'Please write to ' + a);
}); };

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
    pay: /upi/i.test(String(o.payment_method || '')) ? 'upi' : /khata/i.test(String(o.payment_method || '')) ? 'khata' : 'cod',
  };
}
const payText = (o) => (o.pay === 'upi'
  ? 'UPI · ' + (o.payment_status ? String(o.payment_status).replace(/_/g, ' ') : 'pending shop verification')
  : o.pay === 'khata' ? 'Khata (Udhaar) · added to due' : 'Cash on Delivery');

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

// ---------- REVIEWS / FEEDBACK ----------
// all reviews of one shop (public)
function useShopReviews(shopId, tick) {
  const [st, setSt] = useState({ list: [], loading: true, err: '' });
  useEffect(() => {
    if (!shopId) return undefined;
    let dead = false;
    setSt((p) => ({ ...p, loading: true }));
    rpc('get_shop_reviews', { p_shop_id: shopId })
      .then((r) => { if (!dead) setSt({ list: unwrapList(r), loading: false, err: '' }); })
      .catch((e) => { if (!dead) setSt({ list: [], loading: false, err: isMissingFn(e) ? '' : errMsg(e) }); });
    return () => { dead = true; };
  }, [shopId, tick]);
  return st;
}
// reviews written by the logged-in buyer: { [order_id]: {rating, comment} }
function useMyReviews(session) {
  const [m, setM] = useState({});
  const load = useCallback(() => {
    if (!session) { setM({}); return; }
    rpc('get_my_reviews')
      .then((r) => { const o = {}; unwrapList(r).forEach((x) => { o[x.order_id] = x; }); setM(o); })
      .catch(() => {});
  }, [session]);
  useEffect(() => { load(); }, [load]);
  return [m, load, (id, rv) => setM((p) => ({ ...p, [id]: rv }))];
}
const avgRating = (list) => (list.length ? Math.round((list.reduce((t, r) => t + Number(r.rating || 0), 0) / list.length) * 10) / 10 : 0);

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
// a shop offer is live until its end date (no end date = always live)
const isOfferLive = (x) => !!(x && x.offer) &&
  (!x.offer_end_date || new Date(String(x.offer_end_date).slice(0, 10) + 'T23:59:59') >= new Date());
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
        kind === 'w' && { backgroundColor: '#fff' },
        kind === 'x' && { backgroundColor: '#cfd6e4' }, disabled && { opacity: 0.5 }, style]}
    >
      <Text
        style={[s.btnT, kind === 'o' && { color: BLUE }, kind === 'r' && { color: RED },
          kind === 'w' && { color: BLUE },
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
function Chip({ t, on, onPress, color, disabled }) {
  const str = String(t == null ? '' : t);
  const m = str.match(/^(\S+)\s+([\s\S]+)$/);
  const hasEmoji = !!m && /[^\x00-\x7F]/.test(m[1]);
  const emoji = hasEmoji ? m[1] : '';
  const label = trs(hasEmoji ? m[2] : str);
  const fg = on ? '#fff' : INK;
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={onPress}
      style={[s.chip, on && s.chipOn, on && color && { backgroundColor: color, borderColor: color },
        { flexDirection: 'row', alignItems: 'center' }, disabled && { opacity: 0.45 }]}
    >
      {!!emoji && <RNText style={{ fontSize: 15, marginRight: 6, color: fg }}>{emoji}</RNText>}
      <RNText style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{label}</RNText>
    </TouchableOpacity>
  );
}
function Tag({ t, kind, sm }) {
  const c = { g: ['#dcf5e1', '#0a6b3f'], y: ['#fff0c4', '#8a5a00'], r: ['#fbe0db', '#9a2314'],
    b: ['#e3ecff', BLUE], p: ['#ece4fb', PURPLE] }[kind || 'g'];
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
// star rating (tap to choose when onChange is given)
function Stars({ v, onChange, size = 22 }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} disabled={!onChange} onPress={() => onChange && onChange(n)} activeOpacity={0.7}>
          <RNText style={{ fontSize: size, color: n <= Math.round(v) ? GOLD : '#cfd6e4', marginRight: 2 }}>★</RNText>
        </TouchableOpacity>
      ))}
    </View>
  );
}
function Head({ title, sub, onBack, right, color }) {
  return (
    <View style={[s.head, color && { backgroundColor: color }]}>
      <View style={s.rowB}>
        {onBack ? (
          <TouchableOpacity onPress={onBack}>
            <Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
        ) : <View />}
        {right}
      </View>
      <Text style={s.headT}>{title}</Text>
      {!!sub && <Text style={{ color: '#e6eeff', marginTop: 2 }}>{sub}</Text>}
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
// square tile used by the Profile / More pages
function ProfTile({ ic, bg, title, sub, onPress, danger, badge }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[s.tileCard, { borderColor: danger ? '#f6c4d0' : LINE }]}>
      <View style={[s.mic, { backgroundColor: bg, width: 46, height: 46, borderRadius: 14 }]}>
        <RNText style={{ fontSize: 22 }}>{ic}</RNText>
        {!!badge && <View style={s.badge}><RNText style={s.badgeT}>{badge}</RNText></View>}
      </View>
      <Text style={[s.shopN, { marginTop: 10, fontSize: 15 }, danger && { color: RED }]} numberOfLines={1}>{title}</Text>
      <Text style={s.sub} numberOfLines={1}>{sub}</Text>
    </TouchableOpacity>
  );
}
// big colourful stat tile
function StatTile({ ic, v, label, bg, fg }) {
  return (
    <View style={{ width: '48.5%', backgroundColor: bg, borderRadius: 18, padding: 14, marginBottom: 10 }}>
      <RNText style={{ fontSize: 24 }}>{ic}</RNText>
      <RNText style={{ fontSize: 22, fontWeight: '800', color: fg || INK, marginTop: 6 }}>{v}</RNText>
      <Text style={{ fontSize: 12, color: fg || MUTE, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
// photo upload box (shop photo / product photo)
function PhotoPicker({ url, name, size = 90, round, onPick, onRemove, label, busy }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
      <TouchableOpacity onPress={onPick} activeOpacity={0.85}>
        <Photo url={url} name={name || '+'} size={size} round={round} />
        <View style={s.camBadge}><RNText style={{ fontSize: 13 }}>📷</RNText></View>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Btn small kind="o" t={busy ? 'Please wait...' : url ? 'Change photo' : (label || 'Upload photo')} onPress={onPick} disabled={busy} />
        {!!url && !!onRemove && <Btn small kind="r" t="Remove" onPress={onRemove} style={{ marginTop: 6 }} />}
      </View>
    </View>
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
function GradientBox({ children, style, from, to }) {
  const A = from || [168, 230, 176], B = to || [158, 206, 232];
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


function PrivacyPolicyPage({ onBack, color }) {
  const section = (heading, body) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ color: INK, fontSize: 15, fontWeight: '800', marginBottom: 6 }}>{heading}</Text>
      <Text style={{ color: MUTE, fontSize: 13, lineHeight: 21 }}>{body}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={[s.head, { backgroundColor: color || BLUE, paddingBottom: 26 }]}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.8}>
          <Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headT}>Privacy Policy</Text>
        <Text style={{ color: '#e6eeff', marginTop: 4 }}>NearKart · Last updated: 19 November 2026</Text>
      </View>
      <View style={[s.card, { marginTop: 14, padding: 18 }]}>
        <Text style={{ color: INK, fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
          NearKart helps customers discover nearby shops, place orders and receive updates. This policy explains what information the app handles and how it is used.
        </Text>
        {section('1. Information we collect',
          'Account information: email address and password used to create or access your account. Profile and order information: name, phone number, delivery address, orders, order items, order status, reviews and support messages you choose to send. Seller information: shop name, owner/contact details, shop location and area, products, prices, stock, business hours, delivery fees, offers, UPI ID and QR code you choose to provide.')}
        {section('2. Location and device permissions',
          'If you allow location access, NearKart can use your device location while you use the location feature to identify your area and show nearby shops or relevant local services. You can deny or turn off location permission in your device settings; some location-based features may then be unavailable. The app may register a push-notification token and basic device/platform details so order and shop notifications can be delivered.')}
        {section('3. Photos and camera',
          'If you choose to take or upload a shop, product or payment QR image, the app processes and compresses that image before saving it with the related shop or product information. Do not upload images containing information you do not want to share with the relevant shop or app users.')}
        {section('4. How we use information',
          'We use information to create and secure accounts, show shops and products, process and manage orders, support delivery or pickup, maintain seller inventory, display reviews and offers, manage optional Khata records, send order/offer notifications, respond to support requests and maintain the safety and operation of NearKart.')}
        {section('5. Service providers and sharing',
          'NearKart uses Supabase for account authentication, database and backend services, and Expo notification services to help deliver push notifications. Information is shared with the shop involved in an order when needed to fulfil that order, and with service providers that operate app features. We do not state that information is never shared: sharing is limited to these purposes, your choices and applicable legal requirements.')}
        {section('6. Payments',
          'NearKart may display a seller-provided UPI ID or QR code and payment-related order details such as a UTR/reference number where you submit one. UPI payments are handled through the payment app or provider you choose. Never share your UPI PIN, banking password or OTP in NearKart or with a seller.')}
        {section('7. Data retention and security',
          'Information is retained for as long as needed to provide the service, maintain account and order records, resolve disputes, protect users and meet legal or accounting obligations. We use service-provider security features and access controls, but no internet transmission or electronic storage method can be guaranteed to be completely secure.')}
        {section('8. Your choices and requests',
          'You can manage app permissions from your device settings and contact NearKart to request access to, correction of or deletion of personal information. Some order, payment, seller or legal records may need to be retained where required by law or for legitimate business records. To request account or data deletion, contact us using the details below and include the email address associated with your account.')}
        {section('9. Children',
          'NearKart is not designed for children under 13 to create accounts independently. If you believe a child has provided personal information, contact us so we can review the request.')}
        {section('10. Changes to this policy',
          'We may update this policy when app features or legal requirements change. The latest in-app version will show its updated date.')}
        {section('11. Contact NearKart',
          'For privacy questions, data correction or deletion requests, contact ssupportnearkert@gmail.com or call +91 8144937920.')}
        <View style={{ backgroundColor: '#fff4df', borderRadius: 12, padding: 12, marginTop: 2 }}>
          <Text style={{ color: '#80520b', fontSize: 12, lineHeight: 18 }}>
            This in-app policy is an initial notice based on the current app features. Before publishing, NearKart must also host this policy on a public webpage and verify that every statement matches the live app, backend configuration and actual data practices.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

// ======================================================================
// SUPPORT PAGE (buyer + seller): e-mail and phone number of NearKart support
// ======================================================================
function SupportPage({ onBack, color }) {
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <View style={[s.head, { backgroundColor: color || TEAL, paddingBottom: 60 }]}>
        <TouchableOpacity onPress={onBack}><Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text></TouchableOpacity>
        <Text style={s.headT}>Customer Support</Text>
        <Text style={{ color: '#e6eeff', marginTop: 2 }}>We are happy to help you</Text>
      </View>
      <View style={[s.card, { marginTop: -40, alignItems: 'center', padding: 22 }]}>
        <View style={[s.mic, { width: 70, height: 70, borderRadius: 35, backgroundColor: '#dcf5e9' }]}>
          <RNText style={{ fontSize: 34 }}>🎧</RNText>
        </View>
        <Text style={[s.h, { marginTop: 12, marginBottom: 2 }]}>How can we help?</Text>
        <Text style={[s.sub, { textAlign: 'center' }]}>Order problem, payment question or app feedback - contact the NearKart team.</Text>
      </View>
      <TouchableOpacity style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: '#bfe3cf' }]}
        onPress={() => openMail(SUPPORT_EMAIL)} activeOpacity={0.85}>
        <View style={[s.mic, { backgroundColor: '#e3ecff', width: 52, height: 52, borderRadius: 16 }]}>
          <RNText style={{ fontSize: 26 }}>✉️</RNText>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.sub}>Email us</Text>
          <RNText selectable style={{ color: INK, fontWeight: '800', fontSize: 15, marginTop: 2 }}>{SUPPORT_EMAIL}</RNText>
        </View>
        <RNText style={{ color: BLUE, fontSize: 22 }}>›</RNText>
      </TouchableOpacity>
      <TouchableOpacity style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 14, borderColor: '#bfe3cf' }]}
        onPress={() => callPhone(SUPPORT_PHONE)} activeOpacity={0.85}>
        <View style={[s.mic, { backgroundColor: '#dcf5e1', width: 52, height: 52, borderRadius: 16 }]}>
          <RNText style={{ fontSize: 26 }}>📞</RNText>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.sub}>Call us</Text>
          <RNText selectable style={{ color: INK, fontWeight: '800', fontSize: 17, marginTop: 2 }}>{'+91 ' + SUPPORT_PHONE}</RNText>
        </View>
        <RNText style={{ color: GREEN, fontSize: 22 }}>›</RNText>
      </TouchableOpacity>
      <View style={{ paddingHorizontal: 14, marginTop: 14, flexDirection: 'row', gap: 10 }}>
        <Btn kind="g" t="Call now" style={{ flex: 1 }} onPress={() => callPhone(SUPPORT_PHONE)} />
        <Btn t="Send email" style={{ flex: 1 }} onPress={() => openMail(SUPPORT_EMAIL)} />
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ======================================================================
// AUTH (buyer login from Profile / Orders / Place order, seller login from business card)
// ======================================================================
function AuthBox({ role, onSession, onForgot }) {
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
        const meta = j.user.user_metadata || {};
        await onSession({ token: j.access_token, refresh: j.refresh_token, uid: j.user.id,
          email: j.user.email || email.trim(), expires_at: expAt(j), meta_role: meta.role, isNew: signup });
      } else if (signup && j && (j.user || j.id)) {
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
      <TouchableOpacity onPress={onForgot} style={{ alignSelf: 'flex-end', paddingVertical: 10 }}>
        <Text style={{ color: BLUE, fontWeight: '700' }}>Forgot Password?</Text>
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
      <Field label="Registered Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
      <Msg t={msg} ok={good} />
      <View style={{ height: 8 }} />
      <Btn t={busy ? 'Sending...' : 'Send Reset Link'} onPress={submit} disabled={busy} style={{ minHeight: 50 }} />
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
    if (pw.length < 6) { setGood(false); setMsg('Password must be at least 6 characters.'); return; }
    if (pw !== confirmPw) { setGood(false); setMsg('Passwords do not match.'); return; }
    if (!recovery || !recovery.access_token) {
      setGood(false);
      setMsg('Your reset session is invalid. Please request a new reset link.');
      return;
    }
    setBusy(true);
    setMsg('');
    setGood(false);
    try {
      await raw('/auth/v1/user', { method: 'PUT', body: { password: pw } }, recovery.access_token);
      setGood(true);
      setMsg('Your password has been updated successfully.');
      setTimeout(() => { if (onDone) onDone(); }, 1200);
    } catch (e) {
      setGood(false);
      setMsg(authErrMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}
      contentContainerStyle={{ padding: 14, flexGrow: 1, justifyContent: 'center' }}>
      <View style={s.card}>
        <Text style={s.h}>Create New Password</Text>
        <Text style={s.sub}>Choose a new password for your NearKart account.</Text>
        <View style={{ height: 14 }} />
        <Field label="New Password (6+ characters)" value={pw} onChangeText={setPw} secureTextEntry />
        <Field label="Confirm New Password" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry />
        <Msg t={msg} ok={good} />
        <View style={{ height: 8 }} />
        <Btn t={busy ? 'Updating...' : 'Update Password'} onPress={submit} disabled={busy} style={{ minHeight: 50 }} />
      </View>
    </ScrollView>
  );
}
function AuthScreen({ role, onSession, onClose, initialForgot }) {
  const seller = role === 'seller';
  const [forgot, setForgot] = useState(!!initialForgot);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 30, backgroundColor: seller ? PURPLE : BLUE }]}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <View style={{ marginTop: 18 }}><Logo size={30} /></View>
        <Text style={[s.headT, { marginTop: 14 }]}>{seller ? 'Become a NearKart Partner' : 'Welcome to NearKart'}</Text>
        <Text style={{ color: '#e6eeff', marginTop: 4 }}>{seller ? 'Sell your products online and reach shoppers near you' : 'Login or sign up to continue'}</Text>
      </View>
      {forgot ? (
        <ForgotBox onBack={() => setForgot(false)} />
      ) : (
        <AuthBox role={role} onSession={onSession} onForgot={() => setForgot(true)} />
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
        <Text style={s.sub} numberOfLines={1}>{catLabel(x)} · {x.area}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Tag t={x.is_open ? '● Open' : '● Closed'} kind={x.is_open ? 'g' : 'r'} />
          <RNText style={s.sub}>{x.rating > 0 ? '★ ' + x.rating : trs('New')}</RNText>
        </View>
      {isOfferLive(x) && <RNText style={s.offer} numberOfLines={1}>🎁 {x.offer}</RNText>}
      </View>
      <RNText style={{ color: '#9aa3b2', fontSize: 22 }}>›</RNText>
    </TouchableOpacity>
  );
}
function ShopMini({ x, onPress }) {
  const first = shopCats(x)[0];
  return (
    <TouchableOpacity style={s.mini} onPress={() => onPress(x)} activeOpacity={0.85}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Photo url={x.photo_url} name={x.name} size={52} />
        <View style={{ flex: 1 }}>
          <RNText style={s.miniN} numberOfLines={1}>{x.name}</RNText>
          <Text style={s.sub} numberOfLines={1}>{catMeta(first).ic} {catLabel(x)}</Text>
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
      <Photo url={p.image_url} name={p.name} size={110} />
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
  onProfile, onCats, onCat, bellCount }) {
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
    (!ql || matchText(x.name + ' ' + catLabel(x) + ' ' + x.area, ql)) &&
    (!onlyOpen || x.is_open) && (!fcat || shopCats(x).includes(fcat)));
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
            <TouchableOpacity onPress={onBell}>
              <RNText style={{ fontSize: 24 }}>🔔</RNText>
              {!!bellCount && <View style={s.badge}><RNText style={s.badgeT}>{bellCount > 9 ? '9+' : bellCount}</RNText></View>}
            </TouchableOpacity>
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
// BUYER: CATEGORIES (a shop is listed under EVERY category it sells)
// ======================================================================
function Categories({ shops, onShop, initial, clearInitial }) {
  const [sel, setSel] = useState(initial || null);
  useEffect(() => { if (initial) { setSel(initial); clearInitial(); } }, [initial]);
  if (sel) {
    const list = shops.filter((x) => shopCats(x).includes(sel));
    const meta = catMeta(sel);
    return (
      <ScrollView style={{ backgroundColor: BG }}>
        <View style={[s.head, { backgroundColor: PURPLE, paddingBottom: 20 }]}>
          <TouchableOpacity onPress={() => setSel(null)}>
            <Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <View style={[s.mic, { backgroundColor: meta.bg, width: 56, height: 56, borderRadius: 18 }]}>
              <RNText style={{ fontSize: 28 }}>{meta.ic}</RNText>
            </View>
            <View>
              <Text style={[s.headT, { marginTop: 0 }]}>{sel}</Text>
              <Text style={{ color: '#e6eeff' }}>{list.length + ' shops'}</Text>
            </View>
          </View>
        </View>
        <View style={{ padding: 14 }}>
          {list.length === 0 && <Text style={s.empty}>No shops have joined yet.</Text>}
          {list.map((x) => <ShopCard key={x.id} x={x} onPress={onShop} />)}
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <Head title="All Categories" color={PURPLE} sub="Find shops by what they sell" />
      <View style={{ padding: 14 }}>
        {CATS.map((c) => {
          const n = shops.filter((x) => shopCats(x).includes(c.k)).length;
          return (
            <TouchableOpacity key={c.k} style={[s.shopCard, { backgroundColor: c.bg, borderColor: 'transparent' }]} onPress={() => setSel(c.k)}>
              <View style={[s.mic, { backgroundColor: '#fff', width: 60, height: 60, borderRadius: 18 }]}>
                <RNText style={{ fontSize: 28 }}>{c.ic}</RNText>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.shopN}>{c.k}</Text>
                <Text style={[s.sub, { color: INK }]}>{n + ' shops'}</Text>
              </View>
              <RNText style={{ color: INK, fontSize: 22 }}>›</RNText>
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
          <Photo url={p.image_url} name={p.name} size={72} />
          <View style={{ flex: 1 }}>
            <RNText style={{ fontSize: 18, fontWeight: '800', color: INK }}>{p.name}</RNText>
            <Text
              style={s.sub}>{money(p.price)} / {unitLabel(p.unit)} · Stock {qtyLabel(stock, p.unit)}</Text>
            {!!p.description && <RNText style={[s.sub, { marginTop: 2 }]} numberOfLines={2}>{p.description}</RNText>}
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
// BUYER: SHOP PAGE (with product photos and customer reviews)
// ======================================================================
function ShopScreen({ shop, focusId, cart, onBack, onAdd, onCart,profile }) {
  const [ps, setPs] = useState([]);
  const [ld, setLd] = useState(true);
  const [err, setErr] = useState('');
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [lo, setLo] = useState('');
  const [hi, setHi] = useState('');
  const [sheet, setSheet] = useState(null);
  const rv = useShopReviews(shop.id, 0);

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
      <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
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
              <Text style={{ color: '#cfdcf7', marginTop: 2 }}>{catLabel(shop)} · {shop.area}</Text>
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
        <KhataApply shop={shop} profile={profile} />

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
                <Photo url={p.image_url} name={p.name} size={68} />
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

        <View style={s.card}>
          <View style={s.rowB}>
            <Text style={s.h}>⭐ Customer Reviews</Text>
            {rv.list.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Stars v={avgRating(rv.list)} size={16} />
                <RNText style={{ color: INK, fontWeight: '800' }}>{avgRating(rv.list)}</RNText>
              </View>
            )}
          </View>
          {rv.loading && <ActivityIndicator color={BLUE} />}
          {!rv.loading && rv.list.length === 0 && <Text style={s.sub}>No reviews yet.</Text>}
          {rv.list.slice(0, 5).map((r, i) => (
            <View key={i} style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: LINE }}>
              <View style={s.rowB}>
                <RNText style={s.shopN}>{r.customer_name || 'Customer'}</RNText>
                <RNText style={s.sub}>{r.created_at ? when(r.created_at) : ''}</RNText>
              </View>
              <Stars v={Number(r.rating)} size={14} />
              {!!r.comment && <RNText style={{ color: INK, marginTop: 4 }}>{r.comment}</RNText>}
            </View>
          ))}
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
// Khata may be used at checkout ONLY for an approved, not blocked account with a numeric credit limit and due.
// (pending / rejected / blocked / no application / unknown status / missing numbers -> not usable -> Khata is hidden)
// This is a UI rule only: the database must enforce the same thing inside place_order.
function khataUsable(a) {
  if (!a || typeof a !== 'object') return false;
  if (String(a.status || '').trim().toLowerCase() !== 'approved') return false;
  if (a.blocked === true || a.is_blocked === true || a.suspended === true) return false;
  if (a.credit_limit === null || a.credit_limit === undefined || a.credit_limit === '') return false;
  const lim = Number(a.credit_limit), bal = Number(a.balance || 0);
  const expiry = a.credit_limit_expires_at ? new Date(a.credit_limit_expires_at).getTime() : 0;
  return Number.isFinite(lim) && lim >= 0 && Number.isFinite(bal) && expiry > Date.now();
}
function CartScreen({ cart, setCart, session, needLogin, onDone, profile, setProfile, syncProfile }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [dtype, setDtype] = useState('delivery'); // 'delivery' | 'pickup'
  const [pay, setPay] = useState('cod');   
  const [deliveryFees, setDeliveryFees] = useState([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState('');
  const [feesFor, setFeesFor] = useState(null);   // shop id the loaded fees belong to
  const [feesTick, setFeesTick] = useState(0);    // bump to retry loading the fees
  const [utr, setUtr] = useState('');
  const [pinfo, setPinfo] = useState(null);
  const [ploading, setPloading] = useState(false);
  const [perr, setPerr] = useState('');
  const [kacc, setKacc] = useState(null);          // this shop's usable (approved, not blocked) khata account of the buyer; null = Khata hidden
  const [kLoading, setKLoading] = useState(false); // latest Khata credit is being fetched
  const lock = useRef(false);                      // blocks double taps / duplicate submissions
  const shopId = cart && cart.shop ? cart.shop.id : null;
  // Load this shop's area-wise delivery fees (reloaded when the shop changes or on Retry)
  useEffect(() => {
    if (!shopId) { setDeliveryFees([]); setFeesFor(null); setFeesError(''); setFeesLoading(false); return undefined; }
    let dead = false;
    setFeesLoading(true); setFeesError(''); setDeliveryFees([]); setFeesFor(null);
    newRpc('shop_fees_get', { p_shop_id: shopId })
      .then((r) => {
        if (dead) return;
        const wrapped = r && typeof r === 'object' && ['orders', 'products', 'data', 'items', 'rows'].some((k) => Array.isArray(r[k]));
        // null = no rows. Any other non-list answer is NOT "free delivery": it blocks checkout.
        if (r !== null && r !== undefined && !Array.isArray(r) && !wrapped) {
          setFeesError('Delivery charges could not be verified (unexpected response). Please retry.');
          return;
        }
        setDeliveryFees(unwrapList(r).filter((x) => x && typeof x === 'object'));
        setFeesFor(shopId);
      })
      .catch((e) => { if (!dead) setFeesError('Delivery charges could not be loaded: ' + errMsg(e)); })
      .finally(() => { if (!dead) setFeesLoading(false); });
    return () => { dead = true; };
  }, [shopId, feesTick]);
  // Khata is SHOP SPECIFIC: only an approved account of THIS shop is returned
  const loadKhata = useCallback(async () => {
    if (!session || !shopId) return null;
    const r = await kRpc(KHATA.myAccounts());
    const rows = unwrapList(r).filter((x) => x && String(x.shop_id) === String(shopId));
    // any blocked row for this shop hides Khata completely
    if (rows.some((x) => String(x.status || '').trim().toLowerCase() === 'blocked' || x.blocked === true || x.is_blocked === true)) return null;
    return rows.find(khataUsable) || null;
  }, [session, shopId]);
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
  useEffect(() => {
    let dead = false;
    setKacc(null); setKLoading(true);
    loadKhata().then((a) => { if (!dead) setKacc(a); }).catch(() => { if (!dead) setKacc(null); }).finally(() => { if (!dead) setKLoading(false); });
    return () => { dead = true; };
  }, [loadKhata]);
  // re-read the latest credit (called when the buyer taps Khata); on any failure Khata is hidden (fail closed)
  const refreshKhata = () => {
    setKLoading(true);
    loadKhata().then((a) => setKacc(a)).catch(() => setKacc(null)).finally(() => setKLoading(false));
  };
  // if Khata is not (or no longer) available for this shop, never keep it selected
  useEffect(() => { if (pay === 'khata' && !kacc) setPay('cod'); }, [pay, kacc]);
  const items = cart && cart.items ? Object.values(cart.items) : [];
  if (!items.length) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <Head title="Cart" color={GREEN} />
        <RNText style={{ fontSize: 60, textAlign: 'center', marginTop: 40 }}>🛒</RNText>
        <Text style={s.empty}>Your cart is empty.{'\n'}Open a shop and add products.</Text>
      </View>
    );
  }
  const total = items.reduce((t, i) => t + Math.round(i.p.price * i.qty * 100) / 100, 0);
  const kLimit = Number((kacc && kacc.credit_limit) || 0);
  const kUsed = Number((kacc && kacc.balance) || 0);
  const kAvail = Math.max(0, kLimit - kUsed);
  // ---- delivery fee: for DISPLAY and the checkout gate only. place_order recomputes the real fee + total on the server. ----
  // total = product subtotal only | deliveryFee = applicable fee | orderTotal = total + deliveryFee (what the buyer pays)
  const addrText = String(profile.address || '').trim();
  const feesReady = feesFor === shopId && !feesLoading && !feesError;
  const hasAreaFees = deliveryFees.length > 0;
  const areaHit = dtype === 'delivery' && hasAreaFees && addrText ? matchFee(deliveryFees, addrText) : null;
  // Use India Standard Time (IST) for the automatic order-time delivery slot.
  const istNow = new Date(Date.now() + 330 * 60000);
  const istMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();
  const deliverySlot = istMinutes >= 360 && istMinutes < 720 ? 'Morning (6 AM–12 PM)'
    : istMinutes >= 720 && istMinutes < 1080 ? 'Afternoon (12 PM–6 PM)'
    : istMinutes >= 1080 && istMinutes < 1440 ? 'Evening (6 PM–12 AM)' : '';
  const shopFeeKnown = !!(cart.shop && Object.prototype.hasOwnProperty.call(cart.shop, 'delivery_charge'));
  let feeState = 'ok', deliveryFee = 0, feeNote = '', feeBad = '';
  if (dtype === 'delivery' && !deliverySlot) { feeState = 'error'; feeBad = 'Home delivery orders can be placed between 6:00 AM and 12:00 AM IST.'; }
  if (dtype === 'pickup') {
    feeState = 'pickup';
  } else if (!deliverySlot) {
    feeState = 'error'; feeBad = 'Home delivery orders can be placed between 6:00 AM and 12:00 AM IST.';
  } else if (feesError) {
    feeState = 'error'; feeBad = feesError;
  } else if (!feesReady) {
    feeState = 'loading';
  } else if (hasAreaFees) {
    if (!addrText) feeState = 'address';
    else if (!areaHit) feeState = 'unavailable';
    else {
      const slotFee = deliverySlot.startsWith('Morning') ? areaHit.morning_fee
        : deliverySlot.startsWith('Afternoon') ? areaHit.afternoon_fee : areaHit.evening_fee;
      const rawFee = slotFee !== null && slotFee !== undefined && slotFee !== '' ? slotFee : areaHit.fee;
      const af = Number(rawFee);
      if (rawFee === null || rawFee === undefined || rawFee === '' || !Number.isFinite(af) || af < 0) {
        feeState = 'error'; feeBad = 'The delivery charge for "' + areaHit.area + '" and ' + deliverySlot + ' is not configured. Please contact the shop.';
      } else { deliveryFee = af; feeNote = String(areaHit.area) + ' · ' + deliverySlot; }
    }
  } else if (shopFeeKnown) {
    const sraw = cart.shop.delivery_charge;
    const sf = sraw === null || sraw === undefined || sraw === '' ? 0 : Number(sraw);
    if (!Number.isFinite(sf) || sf < 0) { feeState = 'error'; feeBad = 'This shop\'s delivery charge is not valid. Please contact the shop.'; }
    else { deliveryFee = sf; feeNote = deliverySlot; }
  }
  const feeUnknown = feeState === 'ok' && !hasAreaFees && !shopFeeKnown; // shop list did not include delivery_charge: the server adds it
  const orderTotal = Math.round((total + deliveryFee) * 100) / 100;
  const canPlace = feeState === 'pickup' || feeState === 'ok';
  const areaList = deliveryFees.map((x) => x.area).filter(Boolean).join(', ');
  const kOk = kAvail > 0.005 && orderTotal <= kAvail + 0.005; // zero credit or less than the order total (incl. delivery) -> not OK
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
    if (!canPlace) {
      setMsg(feeState === 'unavailable' ? 'Delivery is not available to this address. Choose Pickup or change the address.'
        : feeState === 'error' ? (feeBad || 'Delivery charge could not be verified. Please retry.')
        : feeState === 'address' ? 'Enter your full delivery address' : 'Checking the delivery charge. Please wait a moment.');
      return;
    }
    lock.current = true; setBusy(true); setMsg('');
    let kBefore = 0;
    try {
      // 0) Khata: re-check approval + shop specific limit with fresh numbers right before ordering
      if (pay === 'khata') {
        const acc = await loadKhata();
        if (!acc) { setMsg('Khata is not available for this shop (not approved, blocked or invalid). Please choose another payment method.'); setPay('cod'); lock.current = false; setBusy(false); return; }
        const lim = Number(acc.credit_limit || 0), used = Number(acc.balance || 0), av = Math.max(0, lim - used);
        setKacc(acc);
        if (orderTotal > av + 0.005) {
          setMsg('Not enough Khata credit. Available ' + money(av) + ' (limit ' + money(lim) + ', due ' + money(used) + '), order total ' + money(orderTotal) + '. Pay your due, ask the shop to increase the limit, or choose another payment method.');
          lock.current = false; setBusy(false); return;
        }
        kBefore = used;
      }
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
      const orderArgs = {
        p_shop_id: cart.shop.id,
        p_items: items.map((i) => ({ product_id: i.p.id, qty: i.qty })),
        p_customer_name: name,
        p_customer_phone: phone,
        p_customer_address: dtype === 'pickup' && !address ? 'Pickup from shop' : address,
        p_delivery_type: dtype,
      };
      let res;
      if (pay === 'khata') {
        // Khata goes ONLY through the secure function: it locks the account and checks status + credit on the server
        try {
          res = await rpc('place_order_khata', orderArgs);
        } catch (ek) {
          if (isMissingFn(ek)) throw new Error('Secure Khata ordering is not set up yet. Please choose another payment method.');
          throw ek;
        }
      } else {
        res = await rpc('place_order', { ...orderArgs, p_payment_method: pay });
      }
      let r = res;
      if (Array.isArray(r)) r = r[0];
      if (r && typeof r === 'object' && (r.success === false || r.ok === false || r.error)) {
        throw new Error(typeof r.error === 'string' ? r.error : (r.message || 'Order could not be placed'));
      }
      const id = r && typeof r === 'object' ? (r.order_id || r.id || (r.order && r.order.id)) : r;
      if (!id) throw new Error('Order response was not understood. Please check My Orders before trying again.');
      const number = r && typeof r === 'object' ? (r.order_number || (r.order && r.order.order_number)) : null;
      // the SERVER is the authority: use its final amount / fee when the response carries them
      const srvTotal = r && typeof r === 'object' ? Number(r.total_amount !== undefined && r.total_amount !== null ? r.total_amount : (r.order && r.order.total_amount)) : NaN;
      // Trust a server fee only when the response includes the final time slot; older RPC output contains the pre-trigger legacy fee.
      const hasFinalSlot = !!(r && typeof r === 'object' && (r.delivery_slot || (r.order && r.order.delivery_slot)));
      const srvFee = hasFinalSlot ? Number(r.delivery_fee !== undefined && r.delivery_fee !== null ? r.delivery_fee : (r.order && r.order.delivery_fee)) : NaN;
      const paid = Number.isFinite(srvTotal) && srvTotal > 0 ? srvTotal : orderTotal;
      const paidFee = Number.isFinite(srvFee) && srvFee >= 0 ? srvFee : deliveryFee;
      const amtMsg = Math.abs(paid - orderTotal) > 0.01
        ? 'The final amount confirmed by the system is ' + money(paid) + ' (you were shown ' + money(orderTotal) + '). Please tell the shop if you paid a different amount.' : '';
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
      let khataMsg = '';
      if (pay === 'khata') {
        try {
          const a2 = await loadKhata();
          if (a2 && Number(a2.balance || 0) + 0.01 < kBefore + paid) {
            khataMsg = 'Order placed, but your Khata due did not update automatically. Please tell the shop before delivery.';
          }
        } catch (e3) { /* the order itself is placed; the due can be checked in My Khata */ }
      }
      if (syncProfile) syncProfile();
      onDone({ id: String(id), number, shop: cart.shop, items, total: paid, subtotal: total, deliveryFee: dtype === 'pickup' ? 0 : paidFee,
        deliveryArea: dtype === 'delivery' ? (r && r.delivery_area ? r.delivery_area : (areaHit && areaHit.area ? areaHit.area : '')) : '',
        deliverySlot: dtype === 'delivery' ? (r && r.delivery_slot ? r.delivery_slot : deliverySlot) : '',
        pay, pickup: dtype === 'pickup', utr: pay === 'upi' ? utr.trim() : '', utrMsg, khataMsg, amtMsg });
    } catch (e) { setMsg(orderErrMsg(e)); lock.current = false; }
    setBusy(false);
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <Head title="Cart" sub={cart.shop.name} color={GREEN} />
      <View style={s.card}>
        {items.map((i) => (
          <View key={i.p.id} style={s.prow}>
            <Photo url={i.p.image_url} name={i.p.name} size={56} />
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
          <Text style={s.sub}>Subtotal</Text>
          <RNText style={{ color: INK, fontWeight: '700' }}>{money(total)}</RNText>
        </View>
        <View style={[s.rowB, { marginTop: 4 }]}>
          <RNText style={[s.sub, { flex: 1 }]}>{feeNote ? 'Delivery charge (' + feeNote + ')' : 'Delivery charge'}</RNText>
          <RNText style={{ color: INK, fontWeight: '700' }}>
            {feeState === 'pickup' ? money(0) + ' (Pickup)'
              : feeState === 'loading' ? 'Checking...'
              : feeState === 'address' ? 'Enter address'
              : feeState === 'unavailable' || feeState === 'error' ? 'Not available'
              : feeUnknown ? 'Set by shop' : money(deliveryFee)}
          </RNText>
        </View>
        <View style={[s.rowB, { marginTop: 8 }]}>
          <Text style={s.h}>Total payable</Text>
          <Text style={s.h}>{money(orderTotal)}</Text>
        </View>
        {dtype === 'delivery' && !!deliverySlot && <Text style={[s.sub,{marginTop:6}]}>Delivery charge is calculated automatically from the selected delivery area and order placement time ({deliverySlot}, IST).</Text>}
        {feeUnknown && <Text style={[s.sub, { marginTop: 6 }]}>Any delivery charge of this shop is added when the order is placed. The final amount is confirmed on the order.</Text>}
        {feeState === 'loading' && <ActivityIndicator color={BLUE} style={{ marginTop: 8 }} />}
        {feeState === 'address' && <Text style={[s.sub, { marginTop: 6 }]}>This shop charges delivery by area. Enter your full address below to see the delivery charge.</Text>}
        {feeState === 'unavailable' && (
          <View style={{ marginTop: 8 }}>
            <Msg t={'Delivery is not available to your address.' + (areaList ? ' This shop delivers to: ' + areaList + '.' : '') + ' Change the address or choose Pickup.'} />
          </View>
        )}
        {feeState === 'error' && (
          <View style={{ marginTop: 8 }}>
            <Msg t={feeBad || 'Delivery charge could not be verified.'} />
            {!!feesError && <Btn small kind="o" t="Retry" onPress={() => setFeesTick((n) => n + 1)} />}
          </View>
        )}
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip t="Cash on Delivery" on={pay === 'cod'} onPress={() => setPay('cod')} />
          <Chip t="UPI" on={pay === 'upi'} onPress={() => setPay('upi')} />
          {!!kacc && <Chip t="Khata (Udhaar)" color={AMBER} on={pay === 'khata'} disabled={!kOk || kLoading}
            onPress={() => { setPay('khata'); refreshKhata(); }} />}
        </View>
        {!!kacc && !kOk && pay !== 'khata' && (
          <RNText style={[s.sub, { marginTop: 6 }]}>{'Khata is unavailable for this order: available credit ' + money(kAvail) + ', order total ' + money(orderTotal) + '.'}</RNText>
        )}
        {pay === 'khata' && !!kacc && (
          <View style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#fff7e0', borderWidth: 1, borderColor: '#f2dc9b' }}>
            <View style={s.rowB}><Text style={s.sub}>Credit limit</Text><RNText style={{ color: INK, fontWeight: '700' }}>{money(kLimit)}</RNText></View>
            <View style={[s.rowB, { marginTop: 4 }]}><Text style={s.sub}>Used credit (due)</Text><RNText style={{ color: kUsed > 0 ? RED : GREEN, fontWeight: '700' }}>{money(kUsed)}</RNText></View>
            <View style={[s.rowB, { marginTop: 4 }]}><Text style={s.sub}>Available credit</Text><RNText style={{ color: kOk ? GREEN : RED, fontWeight: '800' }}>{money(kAvail)}</RNText></View>
            {kOk
              ? <Text style={[s.sub, { marginTop: 8 }]}>{'This order (' + money(orderTotal) + ') will be added to your Khata due at ' + cart.shop.name + '.'}</Text>
              : <Msg t={'Not enough Khata credit for this order (' + money(orderTotal) + '). Available: ' + money(kAvail) + '. Choose another payment method or ask the shop to increase your limit.'} />}
          </View>
        )}
        {pay === 'upi' && <Text
          style={[s.sub, { marginTop: 2 }]}>UPI payment is confirmed only after the shop verifies it.</Text>}
        {pay === 'upi' && (
          <UpiPayBox shop={cart.shop} total={orderTotal} info={pinfo} loading={ploading} err={perr}
            utr={utr} setUtr={setUtr} />
        )}
      </View>
      <View style={{ padding: 14 }}>
        <Msg t={msg} />
        <Btn kind="g" t={busy ? 'Please wait...' : feeState === 'loading' ? 'Checking delivery charge...' : !canPlace ? 'Delivery not available' : pay === 'khata' && kLoading ? 'Checking Khata credit...' : pay === 'khata' && !kOk ? 'Khata credit not enough' : 'Place order • ' + money(orderTotal)} onPress={place} disabled={busy || !canPlace || (pay === 'khata' && (kLoading || !kOk))}
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
    <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 24, paddingTop: 70 }} style={{ backgroundColor: '#eefaf2' }}>
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
        {done.subtotal !== undefined && (
          <View style={{ marginBottom: 6 }}>
            <View style={s.rowB}><Text style={s.sub}>Subtotal</Text><RNText style={{ color: INK, fontWeight: '700' }}>{money(done.subtotal)}</RNText></View>
            {!!done.deliveryArea && <View style={s.rowB}><Text style={s.sub}>Delivery area</Text><RNText style={{ color: INK, fontWeight: '700' }}>{done.deliveryArea}</RNText></View>}
            {!!done.deliverySlot && <View style={s.rowB}><Text style={s.sub}>Order-time slot (IST)</Text><RNText style={{ color: INK, fontWeight: '700' }}>{done.deliverySlot}</RNText></View>}
            <View style={[s.rowB, { marginTop: 2 }]}><Text style={s.sub}>Delivery charge</Text><RNText style={{ color: INK, fontWeight: '700' }}>{money(done.deliveryFee || 0)}</RNText></View>
          </View>
        )}
        <View style={s.rowB}>
          <Text style={s.sub}>{(done.pickup ? 'Pickup' : 'Home Delivery') + ' • ' + (done.pay === 'upi' ? 'UPI' : done.pay === 'khata' ? 'Khata (Udhaar)' : 'Cash on Delivery')}</Text>
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
        {done.pay === 'khata' && <Text
          style={[s.sub, { marginTop: 6 }]}>{'This amount is added to your Khata due at ' + done.shop.name + '.'}</Text>}
        {!!done.khataMsg && <View style={{ marginTop: 6 }}><Msg t={done.khataMsg} /></View>}
        {!!done.amtMsg && <View style={{ marginTop: 6 }}><Msg t={done.amtMsg} /></View>}
      </View>
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 14 }}>
        <Btn t="View my orders" onPress={onTrack} />
        <Btn kind="o" t="Go to Home" onPress={onHome} />
      </View>
    </ScrollView>
  );
}
// ======================================================================
// BUYER: FEEDBACK SHEET (rate a delivered order)
// ======================================================================
function ReviewSheet({ o, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const LBL = ['', 'Very bad', 'Bad', 'Okay', 'Good', 'Excellent'];
  const submit = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      await newRpc('submit_review', { p_order: o.id, p_rating: rating, p_comment: txt.trim() || null });
      onDone({ order_id: o.id, rating, comment: txt.trim() });
    } catch (e) {
      if (e && (e.code === '23505' || /duplicate/i.test(String(e.message || '')))) setMsg('You already reviewed this order.');
      else setMsg(errMsg(e));
    }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      <View style={s.rowB}>
        <Text style={s.h}>Rate your order</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ color: MUTE }}>Close</Text></TouchableOpacity>
      </View>
      <RNText style={s.sub}>{(o.shops ? o.shops.name : '') + ' · ' + orderNo(o)}</RNText>
      <View style={{ alignItems: 'center', marginVertical: 16 }}>
        <Stars v={rating} onChange={setRating} size={42} />
        <RNText style={{ color: GOLD, fontWeight: '800', marginTop: 6, fontSize: 16 }}>{LBL[rating]}</RNText>
      </View>
      <Field label="Your feedback (optional)" value={txt} onChangeText={setTxt} multiline autoCapitalize="sentences"
        placeholder="Product quality, delivery, shop behaviour..." />
      <Msg t={msg} />
      <View style={{ height: 8 }} />
      <Btn kind="g" t={busy ? 'Please wait...' : 'Submit feedback'} onPress={submit} disabled={busy} style={{ minHeight: 50 }} />
    </Sheet>
  );
}

// ======================================================================
// BUYER: ORDERS + TRACK ORDER  (get_my_orders_paginated RPC)
// ======================================================================
function TrackOrder({ o, onBack, onReorder, review, onRate }) {
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
    <ScrollView style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 20, backgroundColor: AMBER }]}>
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
          style={{ color: '#fff3d9', marginTop: 2 }}>{orderNo(o)}{shopName ? ' · ' + shopName : ''}</RNText>
      </View>

      {!cancelled && (
        <View style={[s.card, s.rowB, { backgroundColor: '#eefaf2', borderColor: '#bfe3cf' }]}>
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
        {!o.pickup && !!(o.delivery_area || o.delivery_slot) && (
          <View style={{ marginTop: 6 }}>
            {!!o.delivery_area && <View style={s.rowB}><Text style={s.sub}>Delivery area</Text><RNText style={{color:INK,fontWeight:'700',flex:1,textAlign:'right'}}>{o.delivery_area}</RNText></View>}
            {!!o.delivery_slot && <View style={[s.rowB,{marginTop:4}]}><Text style={s.sub}>Order-time slot (IST)</Text><RNText style={{color:INK,fontWeight:'700'}}>{o.delivery_slot}</RNText></View>}
          </View>
        )}
        <View style={[s.rowB, { marginTop: 6 }]}>
          <Text style={s.sub}>Delivery Charge</Text>
          <RNText style={{ color: INK, fontWeight: '700' }}>
            {money(o.pickup ? 0 : Number(o.delivery_fee !== undefined && o.delivery_fee !== null ? o.delivery_fee : (o.deliveryFee !== undefined && o.deliveryFee !== null ? o.deliveryFee : Math.max(0, Number(o.total || 0) - Number(sub || 0)))))}
          </RNText>
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

      {o.status === 'delivered' && (
        <View style={[s.card, { backgroundColor: '#fff8e6', borderColor: '#f3dca0' }]}>
          <Text style={s.h}>Rate your order</Text>
          {review ? (
            <View>
              <Stars v={Number(review.rating)} size={26} />
              {!!review.comment && <RNText style={{ color: INK, marginTop: 6 }}>{review.comment}</RNText>}
            </View>
          ) : (
            <View>
              <Text style={s.sub}>How was your experience with this shop?</Text>
              <Btn t="Submit feedback" onPress={onRate} style={{ marginTop: 10, backgroundColor: GOLD }} />
            </View>
          )}
        </View>
      )}

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
  const [rateO, setRateO] = useState(null);
  const [reviews, , addReview] = useMyReviews(session);
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
  const sheet = rateO ? (
    <ReviewSheet o={rateO} onClose={() => setRateO(null)}
      onDone={(rv) => { addReview(rv.order_id, rv); setRateO(null); }} />
  ) : null;
  if (sel) {
    return (
      <View style={{ flex: 1 }}>
        <TrackOrder o={sel} onBack={() => setSelId(null)} onReorder={onReorder}
          review={reviews[sel.id]} onRate={() => setRateO(sel)} />
        {sheet}
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: BG }} refreshControl={<RefreshControl refreshing={ld} onRefresh={() => load()} />}>
        <Head title="My Orders" sub="Track live orders and view past purchases" color={AMBER} />
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
          const rv = reviews[o.id];
          const edge = o.status === 'delivered' ? GREEN : o.status === 'cancelled' ? RED : BLUE;
          return (
            <TouchableOpacity key={o.id} style={[s.card, { borderLeftWidth: 5, borderLeftColor: edge }]} onPress={() => setSelId(o.id)} activeOpacity={0.85}>
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
                <Text style={s.sub}>{(o.pickup ? 'Pickup' : 'Home Delivery') + ' • ' + (o.pay === 'upi' ? 'UPI' : o.pay === 'khata' ? 'Khata' : 'Cash on Delivery')}</Text>
                <Text style={s.link}>View Details</Text>
              </View>
              {o.status === 'cancelled' && !!o.cancel_reason && <Text
                style={{ color: RED, marginTop: 4 }}>{o.cancel_reason}</Text>}
              {o.status === 'new' && <Btn small kind="r" t="Cancel order" onPress={() => cancel(o)}
                style={{ marginTop: 10, alignSelf: 'flex-start' }} />}
              {o.status === 'delivered' && (rv
                ? <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Stars v={Number(rv.rating)} size={16} /><Text style={s.sub}>Your rating</Text></View>
                : <Btn small t="⭐ Rate your order" onPress={() => setRateO(o)} style={{ marginTop: 10, alignSelf: 'flex-start', backgroundColor: GOLD }} />)}
            </TouchableOpacity>
          );
        })}
        {os.length >= limit && (
          <View style={{ padding: 14 }}><Btn kind="o" t="Load more" onPress={() => setLimit(limit + PAGE)} /></View>
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
      {sheet}
    </View>
  );
}

// ======================================================================
// BUYER: NOTIFICATIONS - order updates, feedback request, shop offers, new products
// ======================================================================
function NoteCard({ ic, bg, title, text, time, onPress, right }) {
  return (
    <TouchableOpacity activeOpacity={onPress ? 0.85 : 1} onPress={onPress}
      style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: bg || '#fff' }]}>
      <View style={[s.mic, { backgroundColor: '#fff' }]}><RNText style={{ fontSize: 22 }}>{ic}</RNText></View>
      <View style={{ flex: 1 }}>
        <RNText style={s.shopN} numberOfLines={2}>{title}</RNText>
        {!!text && <RNText style={s.sub} numberOfLines={2}>{text}</RNText>}
        {!!time && <RNText style={[s.sub, { marginTop: 2, opacity: 0.8 }]}>{time}</RNText>}
      </View>
      {right}
    </TouchableOpacity>
  );
}
function BuyerNotifications({ session, shops, products, needLogin, onShop, onProduct, onOrders, onBack }) {
  const [os, setOs] = useState([]);
  const [khataReminders, setKhataReminders] = useState([]);
  const [ld, setLd] = useState(false);
  const [rateO, setRateO] = useState(null);
  const [reviews, , addReview] = useMyReviews(session);
  const load = useCallback(() => {
    if (!session) { setOs([]); setKhataReminders([]); return; }
    setLd(true);
    rpc('get_my_orders_paginated', { p_limit: 10, p_offset: 0 })
      .then((r) => setOs(unwrapList(r).map(normOrder))).catch(() => {});
    api('/rest/v1/notifications?type=eq.khata_payment_reminder&select=id,title,body,data,created_at,is_read&order=created_at.desc&limit=20')
      .then((r) => setKhataReminders(Array.isArray(r) ? r : []))
      .catch(() => setKhataReminders([]))
      .finally(() => setLd(false));
  }, [session]);
  useEffect(() => { load(); }, [load]);
  const offers = shops.filter((x) => x.offer);
  const newest = [...products].filter(inStock)
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8);
  const toRate = os.filter((o) => o.status === 'delivered' && !reviews[o.id]);
  const ICON = { new: '🧾', accepted: '✅', preparing: '👨‍🍳', ready: '🛍️', on_the_way: '🛵', delivered: '🎉', cancelled: '❌' };
  const empty = !offers.length && !newest.length && !os.length && !khataReminders.length;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: BG }} refreshControl={<RefreshControl refreshing={ld} onRefresh={load} />}>
        <Head title="Notifications" sub="Orders, offers, new products and Khata reminders" onBack={onBack} color={PINK} />

        {khataReminders.length > 0 && (
          <View>
            <Text style={[s.h, s.sec]}>📒 Khata payment reminders</Text>
            {khataReminders.map((n) => (
              <NoteCard key={n.id} ic="📒" bg="#fff8e6"
                title={n.title || 'Khata payment reminder'}
                text={n.body || 'Your Khata payment is due.'}
                time={when(n.created_at)} />
            ))}
          </View>
        )}

        {toRate.length > 0 && (
          <View>
            <Text style={[s.h, s.sec]}>⭐ Rate your order</Text>
            {toRate.slice(0, 3).map((o) => (
              <NoteCard key={'r' + o.id} ic="⭐" bg="#fff8e6"
                title={'How was ' + (o.shops && o.shops.name ? o.shops.name : 'your order') + '?'}
                text={orderNo(o) + ' was delivered. Tell us about the product and the shop.'}
                time={o.updated_at ? when(o.updated_at) : when(o.created_at)}
                onPress={() => setRateO(o)}
                right={<Btn small t="Rate" onPress={() => setRateO(o)} style={{ backgroundColor: GOLD }} />} />
            ))}
          </View>
        )}

        <Text style={[s.h, s.sec]}>📦 Order updates</Text>
        {!session && (
          <View style={[s.card, { alignItems: 'center' }]}>
            <Text style={s.sub}>Login to see your order updates</Text>
            <Btn small t="Login" onPress={needLogin} style={{ marginTop: 8 }} />
          </View>
        )}
        {session && os.length === 0 && <Text style={[s.sub, { marginHorizontal: 14 }]}>No orders yet.</Text>}
        {os.slice(0, 6).map((o) => (
          <NoteCard key={o.id} ic={ICON[o.status] || '📦'} bg={o.status === 'cancelled' ? '#fdecef' : '#eef3ff'}
            title={orderNo(o) + ' · ' + (o.status === 'cancelled' ? 'Order cancelled' : (STEPS[o.status] || ['', ''])[0])}
            text={(o.shops && o.shops.name ? o.shops.name + ' · ' : '') + (o.status === 'cancelled' ? (o.cancel_reason || '') : (STEPS[o.status] || ['', ''])[1])}
            time={when(o.updated_at || o.created_at)} onPress={onOrders} />
        ))}

        <Text style={[s.h, s.sec]}>🎁 Shop offers</Text>
        {offers.length === 0 && <Text style={[s.sub, { marginHorizontal: 14 }]}>No offers right now.</Text>}
        {offers.map((x) => (
          <NoteCard key={'o' + x.id} ic="🎁" bg="#fff3e3" title={x.name + ': ' + x.offer}
            text={catLabel(x) + ' · ' + x.area} onPress={() => onShop(x)}
            right={<Photo url={x.photo_url} name={x.name} size={44} round />} />
        ))}

        <Text style={[s.h, s.sec]}>🆕 New products</Text>
        {newest.length === 0 && <Text style={[s.sub, { marginHorizontal: 14 }]}>No new products yet.</Text>}
        {newest.map((p) => (
          <NoteCard key={'p' + p.id} ic="🆕" bg="#eafaf0"
            title={p.name + ' · ' + money(p.price) + '/' + unitLabel(p.unit)}
            text={(p.shops ? p.shops.name : '') + (p.category ? ' · ' + p.category : '') + ' · ' + qtyLabel(Number(p.online_qty), p.unit) + ' in stock'}
            onPress={() => onProduct(p)}
            right={<Photo url={p.image_url} name={p.name} size={52} />} />
        ))}
        {empty && !ld && <Text style={s.empty}>No notifications yet.</Text>}
        <View style={{ height: 30 }} />
      </ScrollView>
      {rateO && (
        <ReviewSheet o={rateO} onClose={() => setRateO(null)}
          onDone={(rv) => { addReview(rv.order_id, rv); setRateO(null); }} />
      )}
    </View>
  );
}

// ======================================================================
// BUYER: SAVED ADDRESS PAGE
// ======================================================================
function AddressPage({ profile, onSave, loc, onLoc, onBack }) {
  const [d, setD] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [good, setGood] = useState(false);
  const save = async () => {
    if (busy) return;
    if (d.phone && !/^\d{10}$/.test(d.phone.trim())) { setGood(false); setMsg('Phone (10 digits)'); return; }
    setBusy(true); setMsg('');
    const m = await onSave(d);
    setBusy(false);
    if (m) { setGood(false); setMsg(m); } else { setGood(true); setMsg('✅ Saved'); }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <View style={[s.head, { backgroundColor: DARK, paddingBottom: 56 }]}>
        <TouchableOpacity onPress={onBack}><Text style={{ color: '#e6eeff', fontSize: 16 }}>← Back</Text></TouchableOpacity>
        <Text style={s.headT}>Saved Addresses</Text>
        <Text style={{ color: '#e6eeff', marginTop: 2 }}>Used automatically at checkout</Text>
      </View>
      <TouchableOpacity onPress={onLoc} activeOpacity={0.85}
        style={[s.card, { marginTop: -36, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#e8f0ff' }]}>
        <View style={[s.mic, { backgroundColor: '#fff' }]}><RNText style={{ fontSize: 22 }}>📍</RNText></View>
        <View style={{ flex: 1 }}>
          <Text style={s.shopN}>Delivery Location</Text>
          <RNText style={s.sub} numberOfLines={2}>{loc && (loc.full || loc.area) ? (loc.full || loc.area) : trs('Select your location')}</RNText>
        </View>
        <RNText style={{ color: BLUE, fontSize: 22 }}>›</RNText>
      </TouchableOpacity>
      <View style={s.card}>
        <Text style={s.h}>🏠 My address</Text>
        <Field label="Your name" value={d.name} onChangeText={(v) => setD({ ...d, name: v })} autoCapitalize="words" />
        <Field label="Phone (10 digits)" value={d.phone} onChangeText={(v) => setD({ ...d, phone: v })}
          keyboardType="number-pad" maxLength={10} />
        <Field label="Full address" value={d.address} onChangeText={(v) => setD({ ...d, address: v })}
          multiline autoCapitalize="sentences" />
        <Msg t={msg} ok={good} />
        <View style={{ height: 8 }} />
        <Btn t={busy ? 'Please wait...' : 'Save profile'} onPress={save} disabled={busy} style={{ minHeight: 50 }} />
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ======================================================================
// SELLER: shop registration (used only after seller login)
//  - shop photo is uploaded from the gallery (no photo link)
//  - a shop can select MANY categories
// ======================================================================
function SellerSetup({ onCreated, onCancel, defaultArea }) {
   
  const [f, setF] = useState({ name: '', owner: '', phone: '', area: defaultArea || '',
    cats: ['Grocery'], photo: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pbusy, setPbusy] = useState(false);
  const lock = useRef(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const toggleCat = (c) => {
    const has = f.cats.includes(c);
    if (has && f.cats.length === 1) return;
    setF({ ...f, cats: has ? f.cats.filter((x) => x !== c) : [...f.cats, c] });
  };
  const pickPhoto = async () => {
    setPbusy(true); setMsg('');
    try { const d = await pickShopPhoto(); if (d) setF((p) => ({ ...p, photo: d })); }
    catch (e) { setMsg(e.message || 'Could not open the gallery'); }
    setPbusy(false);
  };
  const save = async () => {
    if (busy || lock.current) return;
    if (!f.name.trim() || !f.owner.trim() || !f.area.trim() || !/^\d{10}$/.test(f.phone.trim())) { setMsg('Enter shop name, owner, 10-digit phone and area'); return; }
    lock.current = true; setBusy(true); setMsg('');
    try {
      const uid = SESSION && SESSION.uid;
      if (!uid) throw new Error('Session expired. Please log in again.');
      await ensureSellerProfile(uid, { name: f.owner.trim(), phone: f.phone.trim(), area: f.area.trim(),
        address: f.area.trim(), email: SESSION.email });
      let shop = null;
      try {
        let ex = await shopRpc('mine');
        if (Array.isArray(ex)) ex = ex[0];
        if (ex && ex.id) shop = ex;
      } catch (e) {
        if (e.network || e.missingRpc) throw e;
      }
      if (!shop) {
        let r = await shopRpc('create', {
          p_name: f.name.trim(), p_owner_name: f.owner.trim(), p_phone: f.phone.trim(),
          p_area: f.area.trim(), p_category: f.cats.join(','), p_photo_url: f.photo || null,
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
      <Text style={s.label}>Shop photo</Text>
      <PhotoPicker url={f.photo} name={f.name || 'S'} size={90} round onPick={pickPhoto} busy={pbusy}
        label="Upload shop photo" onRemove={() => setF({ ...f, photo: '' })} />
      <Field label="Shop name" value={f.name} onChangeText={set('name')} autoCapitalize="words" />
      <Field label="Owner name" value={f.owner} onChangeText={set('owner')} autoCapitalize="words" />
      <Field label="Phone number" value={f.phone} onChangeText={set('phone')} keyboardType="number-pad" maxLength={10} />
      <Field label="Village / Area" value={f.area} onChangeText={set('area')} autoCapitalize="words" />
      <Text style={s.label}>Category (select all that you sell)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {SHOP_CATS.map((c) => <Chip key={c} t={catMeta(c).ic + ' ' + c} on={f.cats.includes(c)} color={PURPLE} onPress={() => toggleCat(c)} />)}
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
      <View style={[s.head, { paddingBottom: 24, backgroundColor: PURPLE }]}>
        <Logo size={28} />
        <Text style={[s.headT, { marginTop: 12 }]}>Establish Your Local Business Presence</Text>
        <Text style={{ color: '#e6eeff', marginTop: 4 }}>Sell your products online and reach shoppers near you</Text>
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
// - logged-in buyer : account card + colourful tiles + Log Out, NO business card
// ======================================================================
function Profile({ session, needLogin, onPartner, onLogout, onOrders, lang, onLang, profile, loc, onLoc,
  onAddr, onSupport, onNotif, onKhata, onPrivacy }) {
  const guest = !session;
  const display = profile.name || (session ? session.email : 'Guest');
  const langName = (LANGS.find((l) => l[0] === lang) || LANGS[0])[1];
  const locText = loc && (loc.full || loc.area) ? (loc.full || loc.area) : 'Select your location';

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

      {/* colourful tiles - each one opens its own page */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
        paddingHorizontal: 14, marginTop: 4 }}>
        <ProfTile ic="📦" bg="#fff0d6" title="My Orders"
          sub={guest ? 'Login or sign up to continue' : 'Track live orders and view past purchases'}
          onPress={guest ? needLogin : onOrders} />
          <ProfTile ic="📒" bg="#fff0d6" title="My Khata"
  sub={guest ? 'Login or sign up to continue' : 'View credit balance and payment history'}
  onPress={guest ? needLogin : onKhata} />
        <ProfTile ic="🔔" bg="#fde4ea" title="Notifications" sub="Orders, offers & new products" onPress={onNotif} />
        <ProfTile ic="📍" bg="#e8f0ff" title="Delivery Location" sub={locText} onPress={onLoc} />
        {!guest && (
          <ProfTile ic="🏠" bg="#e6e8ff" title="Saved Addresses" sub={profile.address || 'Full address'} onPress={onAddr} />
        )}
        <ProfTile ic="🌐" bg="#d9f6ff" title="Language" sub={langName} onPress={() => onLang('pick')} />
        <ProfTile ic="🎧" bg="#dcf5e9" title="Customer Support" sub={SUPPORT_PHONE} onPress={onSupport} />
        <ProfTile ic="🔒" bg="#e3ecff" title="Privacy Policy" sub="How NearKart uses your information" onPress={onPrivacy} />
        {!guest && (
          <ProfTile ic="↪" bg="#fdecef" title="Log Out" sub="End shopping session" onPress={onLogout} danger />
        )}
      </View>

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
// save the shop offer / open flag (existing update_my_shop RPC)
async function patchShop(shop, setShop, b) {
  const body = { p_shop_id: shop.id };

  if ('is_open' in b) body.p_is_open = b.is_open;

  if ('offer' in b) {
    body.p_offer = b.offer;
    body.p_update_offer = true;
  }

  if ('offer_end_date' in b) {
    body.p_offer_end_date = b.offer_end_date || null;
    body.p_update_offer_end_date = true;
  }

  let r = await shopRpc('update', body);
  if (Array.isArray(r)) r = r[0];

  setShop(r && r.id ? { ...shop, ...r } : { ...shop, ...b });
}

function SellerDash({ shop, setShop, os, products, goTab, openOrder, reloadP, ordersErr, onBell }) {
  const [offer, setOffer] = useState(shop.offer || '');
  const [offerEndDate, setOfferEndDate] = useState(shop.offer_end_date || '');
  const [msg, setMsg] = useState('');
  const patch = async (b) => {
    try { await patchShop(shop, setShop, b); setMsg('✅ Saved'); } catch (e) { setMsg(errMsg(e)); }
  };
  const newOrdersCount = os.filter((o) => o.status === 'new').length;
  const totalOrdersCount = os.length;
  const sales = os
    .filter((o) => o.status !== 'cancelled')
    .reduce((total, o) => total + Number(o.total || 0), 0);
  const lowP = products.filter((p) => p.active !== false && Number(p.online_qty) <= Number(p.low_alert || 5));
  const addStock = async (p) => { const m = await bumpStock(shop, p, reloadP); setMsg(m); };
  const stats = [
    ['🛍️', newOrdersCount, 'New Orders', '#e3ecff'],
    ['📋', totalOrdersCount, 'Total Orders', '#fff0d6'],
    ['₹', money(sales), 'Total Sales', '#dcf5e1'],
    ['⭐', shop.rating > 0 ? shop.rating : '—', 'Shop Rating', '#fff3c4'],
  ];
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 26 }]}>
        <View style={s.rowB}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flex: 1 }}>
            <Photo url={shop.photo_url} name={shop.name} size={60} round />
            <View style={{ flex: 1 }}>
              <RNText
                style={{ color: '#fff', fontSize: 20, fontWeight: '800' }} numberOfLines={1}>{shop.name} ✔</RNText>
              <RNText style={{ color: '#cfdcf7' }} numberOfLines={1}>{catLabel(shop)} · {shop.area}</RNText>
            </View>
          </View>
          <TouchableOpacity onPress={onBell} style={{ marginRight: 10 }}>
            <RNText style={{ fontSize: 24 }}>🔔</RNText>
            {newOrdersCount > 0 && <View style={s.badge}><RNText style={s.badgeT}>{newOrdersCount}</RNText></View>}
          </TouchableOpacity>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {stats.map(([ic, v, l, bg]) => <StatTile key={l} ic={ic} v={v} label={trs(l)} bg={bg} />)}
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
        <Field
  label="Advertisement End Date (optional)"
  value={offerEndDate}
  onChangeText={setOfferEndDate}
  placeholder="YYYY-MM-DD (Example: 2026-12-31)"
/>
        <Btn
  t="Publish"
  onPress={() => patch({
    offer: offer.trim() || null,
    offer_end_date: offerEndDate.trim() || null
  })}
/>
      </View>
      {lowP.length > 0 && (
        <View style={[s.card, { backgroundColor: '#fff8e6', borderColor: '#f3dca0' }]}>
          <Text style={s.h}>⚠️ Stock alert</Text>
          {lowP.slice(0, 4).map((p) => (
            <View key={p.id} style={s.prow}>
              <Photo url={p.image_url} name={p.name} size={40} />
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
    <ScrollView style={{ backgroundColor: BG }}>
      <View style={[s.head, { paddingBottom: 20, backgroundColor: TEAL }]}>
        <View style={s.rowB}>
          <TouchableOpacity onPress={onBack}>
            <RNText style={{ color: '#fff', fontSize: 24 }}>←</RNText>
          </TouchableOpacity>
          <Tag t={STATUS[o.status] || o.status} kind={o.status === 'cancelled' ? 'r' : o.status === 'delivered' ? 'g' : 'b'} />
        </View>
        <Text style={s.headT}>Order Details</Text>
        <RNText style={{ color: '#e6eeff', marginTop: 2 }}>{orderNo(o)} · {when(o.created_at)}</RNText>
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
        <View style={[s.card, { backgroundColor: '#f3efff', borderColor: '#d8cdf3' }]}>
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
          <RNText style={{ color: INK, fontWeight: '700' }}>
            {money(o.pickup ? 0 : Number(o.delivery_fee !== undefined && o.delivery_fee !== null ? o.delivery_fee : (o.deliveryFee !== undefined && o.deliveryFee !== null ? o.deliveryFee : Math.max(0, Number(o.total || 0) - Number(sub || 0)))))}
          </RNText>
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
    <ScrollView style={{ backgroundColor: BG }}>
      <Head title="Seller Orders" sub="Real-time incoming orders" color={TEAL} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: 14, paddingBottom: 4 }}>
        {ALL_ST.map((k) => <Chip key={k} color={TEAL} t={STATUS[k] + ' ' + os.filter((o) => o.status === k).length} on={tab === k} onPress={() => setTab(k)} />)}
      </ScrollView>
      <Msg t={err || err0} />
      {list.length === 0 && <Text style={s.empty}>No orders in this list.</Text>}
      {list.map((o) => (
        <TouchableOpacity key={o.id} style={[s.card, { borderLeftWidth: 5, borderLeftColor: o.status === 'new' ? ORANGE : o.status === 'cancelled' ? RED : o.status === 'delivered' ? GREEN : BLUE }]} onPress={() => setSel(o.id)} activeOpacity={0.85}>
          <View style={s.rowB}>
            <Text style={s.shopN}>{orderNo(o)}</Text>
            {o.status === 'new' ? <Tag t={'⏱ ' + minsLeft(o.created_at) + ' min left'} kind="y" /> : <Tag t={STATUS[o.status] || o.status} kind={o.status === 'cancelled' ? 'r' : 'b'} />}
          </View>
          <RNText style={[s.shopN, { marginTop: 8 }]}>{o.customer_name}</RNText>
          <RNText style={s.sub}>{o.pickup ? '🏪 ' + trs('Pickup') : '📍 ' + o.address}</RNText>
          <View style={[s.rowB, { marginTop: 8 }]}>
            <RNText
              style={s.sub}>{(o.order_items || []).length + ' ' + trs('Items')} · {when(o.created_at)} · {o.pay === 'upi' ? 'UPI' : o.pay === 'khata' ? 'Khata' : 'COD'}</RNText>
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
// ---------- Seller: product add / edit sheet ----------
// product photo is uploaded from the gallery (no photo link). Buyers see this photo.
// When the seller picks a main category that the shop does not sell yet, it is added to the shop categories,
// so the shop automatically shows up under that category for buyers.
function ProductForm({ shop, setShop, product, onClose, onDone }) {
  const p = product;
  const [f, setF] = useState({
    name: p ? p.name : '', cat: p && p.category ? p.category : PROD_CATS[0], unit: p ? p.unit : 'kg',
    price: p ? num(Number(p.price)) : '', op: p && p.original_price ? num(Number(p.original_price)) : '',
    discount: p && p.discount_percent ? String(p.discount_percent) : '',
offerUntil: p && p.offer_expires_at ? String(p.offer_expires_at).slice(0, 10) : '',
    oq: p ? num(Number(p.online_qty)) : '', sq: p ? num(Number(p.shop_qty || 0)) : '',
    low: p && p.low_alert ? num(Number(p.low_alert)) : '5',
    desc: p && p.description ? p.description : '',
    img: p && p.image_url ? p.image_url : '',
  });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [pbusy, setPbusy] = useState(false);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const pickPhoto = async () => {
    setPbusy(true); setMsg('');
    try { const d = await pickProductPhoto(); if (d) setF((x) => ({ ...x, img: d })); }
    catch (e) { setMsg(e.message || 'Could not open the gallery'); }
    setPbusy(false);
  };
  const save = async () => {
    if (busy) return;
    const price = Number(f.price), oq = parseFloat(f.oq), sq = parseFloat(f.sq) || 0;
    const op = f.op ? Number(f.op) : 0;
    const discount = f.discount ? Number(f.discount) : 0;
const offerUntil = f.offerUntil.trim();

if (!Number.isFinite(discount) || discount < 0 || discount > 90) {
  setMsg('Discount must be between 1 and 90 percent.');
  return;
}

if (discount > 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(offerUntil)) {
    setMsg('Enter offer expiry date in YYYY-MM-DD format.');
    return;
  }

  const expiry = new Date(offerUntil + 'T23:59:59');
  if (isNaN(expiry.getTime()) || expiry <= new Date()) {
    setMsg('Offer expiry date must be in the future.');
    return;
  }
}
    if (!f.name.trim() || !(price > 0) || isNaN(oq) || oq < 0) { setMsg('Enter name, price and online stock'); return; }
    if (f.op && (isNaN(op) || op < price)) { setMsg('Original price must be equal to or higher than the price'); return; }
    const prod = {
      name: f.name.trim(), category: f.cat, unit: f.unit, price,
      original_price: op > 0 ? op : null,
      discount_percent: discount,
offer_expires_at: discount > 0 ? offerUntil : null,
      description: f.desc.trim() || null,
      image_url: f.img || null,
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
      // make the shop visible under this category for buyers
      let note = '';
      if (SHOP_CATS.includes(f.cat) && !shopCats(shop).includes(f.cat)) {
        try {
          const nc = [...shopCats(shop), f.cat].join(',');
          await newRpc('update_my_shop_categories', { p_shop_id: shop.id, p_category: nc });
          if (setShop) setShop({ ...shop, category: nc });
        } catch (e3) { note = ' (category could not be added to the shop: ' + errMsg(e3) + ')'; }
      }
      onDone((p ? '✅ Saved' : '✅ Product added') + note);
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
        <Text style={s.label}>Product photo</Text>
        <PhotoPicker url={f.img} name={f.name || 'P'} size={90} onPick={pickPhoto} busy={pbusy}
          label="Upload product photo" onRemove={() => setF({ ...f, img: '' })} />
        <Field label="Name" value={f.name} onChangeText={set('name')} autoCapitalize="words" />
        <Text style={s.label}>Category</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>{PROD_CATS.map((c) => <Chip key={c} t={c} on={f.cat === c} color={PURPLE} onPress={() => set('cat')(c)} />)}</View>
        <Text style={s.label}>Unit (how you sell it)</Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>{UNITS.map((u) => <Chip key={u} t={u} on={f.unit === u} onPress={() => set('unit')(u)} />)}</View>
        <Field label={'Price (₹ per ' + unitLabel(f.unit) + ')'} value={f.price} onChangeText={set('price')} keyboardType="decimal-pad" />
        <Field label="Original price (₹, optional)" value={f.op} onChangeText={set('op')} keyboardType="decimal-pad" />
        <Field
  label="Offer Discount (%)"
  value={f.discount}
  onChangeText={set('discount')}
  keyboardType="number-pad"
  placeholder="Example: 20"
/>

<Field
  label="Offer Last Date (YYYY-MM-DD)"
  value={f.offerUntil}
  onChangeText={set('offerUntil')}
  placeholder="Example: 2026-12-31"
/>
        <Field label={'Online stock (' + unitLabel(f.unit) + ')'} value={f.oq} onChangeText={set('oq')} keyboardType="decimal-pad" />
        <Field label={'Shop stock (' + unitLabel(f.unit) + ', counter only)'} value={f.sq} onChangeText={set('sq')} keyboardType="decimal-pad" />
        <Field label="Low stock alert at" value={f.low} onChangeText={set('low')} keyboardType="decimal-pad" />
        <Field label="Description (optional)" value={f.desc} onChangeText={set('desc')} multiline autoCapitalize="sentences" />
      </ScrollView>
      <Msg t={msg} />
      <View style={{ height: 8 }} />
      <Btn t={busy ? 'Please wait...' : p ? 'Save' : 'Add product'} onPress={save} disabled={busy}
        style={{ minHeight: 50 }} />
    </Sheet>
  );
}

// ---------- Seller: products table ----------
function SellerProducts({ shop, setShop, products, reloadP, addOpen, setAddOpen, perr, canManage, onRequireSubscription }) {
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
      <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
        <Head
          title="All Products"
          color={PURPLE}
          sub={products.length + ' products in total'}
          right={<Btn small kind="w" t="+ Add Product" onPress={() => { if (!canManage) { onRequireSubscription(); return; } setEdit(null); setAddOpen(true); }} />}
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
                <Chip key={k} t={t} on={fl === k} onPress={() => setFl(k)} color={PURPLE} />
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
                  <Photo url={p.image_url} name={p.name} size={44} />
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
          setShop={setShop}
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

// ======================================================================
// SELLER: More-tab sub pages (all real pages, each with its own colour)
// ======================================================================
function SubHead({ title, sub, color, onBack, right }) {
  return <Head title={title} sub={sub} color={color} onBack={onBack} right={right} />;
}

// ---- Manage Your Shop: photo, details, categories ----
function SellerManage({ shop, setShop, onBack }) {
  const [busy, setBusy] = useState(false);
  const [cbusy, setCbusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [cats, setCats] = useState(shopCats(shop));
  const changePhoto = async () => {
    setMsg(''); setBusy(true);
    try {
      const d = await pickShopPhoto();
      if (d) {
        await newRpc('update_my_shop_photo', { p_shop_id: shop.id, p_photo_url: d });
        setShop({ ...shop, photo_url: d }); setMsg('✅ Shop photo saved');
      }
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  const removePhoto = async () => {
    setMsg(''); setBusy(true);
    try {
      await newRpc('update_my_shop_photo', { p_shop_id: shop.id, p_photo_url: null });
      setShop({ ...shop, photo_url: null }); setMsg('✅ Shop photo removed');
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  const toggle = (c) => {
    const has = cats.includes(c);
    if (has && cats.length === 1) return;
    setCats(has ? cats.filter((x) => x !== c) : [...cats, c]);
  };
  const saveCats = async () => {
    setCbusy(true); setMsg('');
    try {
      const v = cats.join(',');
      await newRpc('update_my_shop_categories', { p_shop_id: shop.id, p_category: v });
      setShop({ ...shop, category: v }); setMsg('✅ Categories saved');
    } catch (e) { setMsg(errMsg(e)); }
    setCbusy(false);
  };
  const row = (k, v) => (
    <View style={[s.rowB, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINE }]}>
      <Text style={s.sub}>{k}</Text>
      <RNText style={{ color: INK, fontWeight: '700', flexShrink: 1, textAlign: 'right' }}>{v || '—'}</RNText>
    </View>
  );
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <SubHead title="Manage Your Shop" sub="Photo, details and categories" color={BLUE} onBack={onBack} />
      <Msg t={msg} ok={msg.startsWith('✅')} />
      <View style={s.card}>
        <Text style={s.h}>📷 Shop profile photo</Text>
        <PhotoPicker url={shop.photo_url} name={shop.name} size={100} round onPick={changePhoto} busy={busy}
          label="Upload shop photo" onRemove={removePhoto} />
        <Text style={s.sub}>This photo is shown to every buyer on your shop card and shop page.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>🏪 Shop details</Text>
        {row('Shop name', shop.name)}
        {row('Owner', shop.owner_name)}
        {row('Phone', shop.phone)}
        {row('Area', shop.area)}
        {row('Status', shop.is_open ? 'Open' : 'Closed')}
      </View>
      <View style={s.card}>
        <Text style={s.h}>🗂️ Categories you sell</Text>
        <Text style={[s.sub, { marginBottom: 8 }]}>Select all types of products you sell. Buyers will find your shop under each of them.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {SHOP_CATS.map((c) => <Chip key={c} t={catMeta(c).ic + ' ' + c} on={cats.includes(c)} color={PURPLE} onPress={() => toggle(c)} />)}
        </View>
        <Btn t={cbusy ? 'Please wait...' : 'Save'} onPress={saveCats} disabled={cbusy} style={{ marginTop: 6 }} />
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Business Hours (opening hours are kept on this phone, open/closed switch is live) ----
function SellerHours({ shop, setShop, onBack }) {
  const key = 'hours_' + shop.id;
  const [h, setH] = useState({ open: '09:00 AM', close: '09:00 PM', off: [] });
  const [msg, setMsg] = useState('');
  useEffect(() => { store.get(key).then((v) => { if (v) { try { setH(JSON.parse(v)); } catch (e) {} } }); }, [key]);
  const toggleDay = (d) => setH({ ...h, off: h.off.includes(d) ? h.off.filter((x) => x !== d) : [...h.off, d] });
  const save = async () => { await store.set(key, JSON.stringify(h)); setMsg('✅ Saved'); };
  const flip = async () => {
    try { await patchShop(shop, setShop, { is_open: !shop.is_open }); setMsg('✅ Saved'); } catch (e) { setMsg(errMsg(e)); }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <SubHead title="Business Hours" sub="Set open hours and holidays" color={AMBER} onBack={onBack} />
      <Msg t={msg} ok={msg.startsWith('✅')} />
      <View style={[s.card, { backgroundColor: shop.is_open ? '#eefaf2' : '#fdecef' }]}>
        <View style={s.rowB}>
          <View>
            <Text style={s.h}>{shop.is_open ? '● Open' : '● Closed'}</Text>
            <Text style={s.sub}>Customers can order only when the shop is open</Text>
          </View>
          <Btn small kind={shop.is_open ? 'r' : 'g'} t={shop.is_open ? 'Close shop' : 'Open shop'} onPress={flip} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>🕒 Daily timing</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Field label="Opens at" value={h.open} onChangeText={(v) => setH({ ...h, open: v })} /></View>
          <View style={{ flex: 1 }}><Field label="Closes at" value={h.close} onChangeText={(v) => setH({ ...h, close: v })} /></View>
        </View>
        <Text style={s.label}>Weekly holiday (tap the days your shop is closed)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {DAYS.map((d) => <Chip key={d} t={d} on={h.off.includes(d)} color={RED} onPress={() => toggleDay(d)} />)}
        </View>
        <Btn t="Save" onPress={save} style={{ marginTop: 6 }} />
        <Text style={[s.sub, { marginTop: 8 }]}>Hours and holidays are saved on this phone. The Open / Closed switch above is live for buyers.</Text>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Delivery and Pickup (kept on this phone) ----
function SellerDelivery({ shop, onBack }) {
  const key = 'delivery_' + shop.id;
  const [d, setD] = useState({ delivery: true, pickup: true, radius: '5', min: '0' });
  const [msg, setMsg] = useState('');
  useEffect(() => { store.get(key).then((v) => { if (v) { try { setD(JSON.parse(v)); } catch (e) {} } }); }, [key]);
  const save = async () => { await store.set(key, JSON.stringify(d)); setMsg('✅ Saved'); };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <SubHead title="Delivery and Pickup" sub="Manage delivery zones and pickup options" color={GREEN} onBack={onBack} />
      <Msg t={msg} ok />
      <View style={s.card}>
        <View style={s.rowB}>
          <View><Text style={s.shopN}>🛵 Home delivery</Text><Text style={s.sub}>Deliver orders to the customer's home</Text></View>
          <Switch value={d.delivery} onValueChange={(v) => setD({ ...d, delivery: v })} trackColor={{ true: GREEN }} />
        </View>
        <View style={[s.rowB, { marginTop: 16 }]}>
          <View><Text style={s.shopN}>🏪 Pickup from shop</Text><Text style={s.sub}>Customer collects the order at your shop</Text></View>
          <Switch value={d.pickup} onValueChange={(v) => setD({ ...d, pickup: v })} trackColor={{ true: GREEN }} />
        </View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>📍 Delivery zone</Text>
        <Field label="Delivery radius (km)" value={d.radius} onChangeText={(v) => setD({ ...d, radius: v })} keyboardType="decimal-pad" />
        <Field label="Minimum order (₹)" value={d.min} onChangeText={(v) => setD({ ...d, min: v })} keyboardType="decimal-pad" />
        <Btn kind="g" t="Save" onPress={save} />
        <Text style={[s.sub, { marginTop: 8 }]}>These settings are saved on this phone and help you plan. Set standard and area-wise delivery charges under Area Delivery Charges.</Text>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Categories overview ----
function SellerCategories({ shop, products, onBack, onManage }) {
  const mine = shopCats(shop);
  const count = (c) => products.filter((p) => p.category === c).length;
  const extra = Array.from(new Set(products.map((p) => p.category).filter((c) => c && !SHOP_CATS.includes(c))));
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <SubHead title="Categories" sub="Manage your product categories" color={PURPLE} onBack={onBack} />
      <View style={s.card}>
        <View style={s.rowB}><Text style={s.h}>Shop categories</Text><Btn small kind="o" t="Edit" onPress={onManage} /></View>
        <Text style={[s.sub, { marginBottom: 8 }]}>Buyers find your shop under these categories.</Text>
        {mine.map((c) => (
          <View key={c} style={[s.prow, { backgroundColor: catMeta(c).bg, borderRadius: 14, paddingHorizontal: 10, marginBottom: 8 }]}>
            <RNText style={{ fontSize: 26 }}>{catMeta(c).ic}</RNText>
            <View style={{ flex: 1 }}><Text style={s.shopN}>{c}</Text></View>
            <Tag t={count(c) + ' products'} kind="p" />
          </View>
        ))}
      </View>
      {extra.length > 0 && (
        <View style={s.card}>
          <Text style={s.h}>Product types</Text>
          {extra.map((c) => (
            <View key={c} style={[s.rowB, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINE }]}>
              <Text style={s.shopN}>{c}</Text><Tag t={count(c) + ' products'} kind="b" />
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Inventory ----
function SellerInventory({ shop, products, reloadP, onBack }) {
  const [msg, setMsg] = useState('');
  const act = products.filter((p) => p.active !== false);
  const out = act.filter((p) => Number(p.online_qty) <= 0);
  const low = act.filter((p) => Number(p.online_qty) > 0 && Number(p.online_qty) <= Number(p.low_alert || 5));
  const ok = act.length - out.length - low.length;
  const plus = async (p) => { const m = await bumpStock(shop, p, reloadP); setMsg(m || '✅ Saved'); };
  const need = [...out, ...low];
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <SubHead title="Inventory" sub="Track stock and manage inventory" color={TEAL} onBack={onBack} />
      <Msg t={msg} ok={msg.startsWith('✅')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 14, paddingBottom: 4 }}>
        <StatTile ic="📦" v={act.length} label="Active products" bg="#e3ecff" />
        <StatTile ic="✅" v={ok} label="In stock" bg="#dcf5e1" />
        <StatTile ic="⚠️" v={low.length} label="Low stock" bg="#fff3c4" />
        <StatTile ic="⛔" v={out.length} label="Out of stock" bg="#fbe0db" />
      </View>
      <View style={s.card}>
        <Text style={s.h}>Needs restock</Text>
        {need.length === 0 && <Text style={s.sub}>All products have enough stock.</Text>}
        {need.map((p) => (
          <View key={p.id} style={s.prow}>
            <Photo url={p.image_url} name={p.name} size={44} />
            <View style={{ flex: 1 }}>
              <RNText style={s.shopN}>{p.name}</RNText>
              <Text style={s.sub}>{Number(p.online_qty) <= 0 ? 'Out of stock' : 'Only ' + qtyLabel(Number(p.online_qty), p.unit) + ' left'}</Text>
            </View>
            <Btn small t="+10" onPress={() => plus(p)} />
          </View>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.h}>All stock</Text>
        {act.map((p) => (
          <View key={p.id} style={[s.rowB, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINE }]}>
            <RNText style={[s.shopN, { flex: 1 }]} numberOfLines={1}>{p.name}</RNText>
            <RNText style={s.sub}>{'Online ' + qtyLabel(Number(p.online_qty), p.unit) + ' · Shop ' + qtyLabel(Number(p.shop_qty || 0), p.unit)}</RNText>
          </View>
        ))}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Deals and Offers ----
function SellerDeals({ shop, setShop, onBack }) {
  const [offer, setOffer] = useState(shop.offer || '');
  const [msg, setMsg] = useState('');
  const SAMPLES = ['Weekend special: 20% OFF', 'Free delivery above ₹300', 'Buy 1 Get 1 on snacks', 'Fresh vegetables - 10% OFF'];
  const save = async (v) => {
    try { await patchShop(shop, setShop, { offer: v }); setMsg('✅ Saved'); if (!v) setOffer(''); } catch (e) { setMsg(errMsg(e)); }
  };
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <SubHead title="Deals and Offers" sub="Create and manage deals and discounts" color={PINK} onBack={onBack} />
      <Msg t={msg} ok={msg.startsWith('✅')} />
      {!!shop.offer && (
        <View style={[s.adBox, { marginHorizontal: 14, marginTop: 12, backgroundColor: PINK }]}>
          <RNText style={{ color: '#ffd6e4', fontSize: 12, fontWeight: '700' }}>LIVE NOW</RNText>
          <RNText style={{ color: '#fff', fontWeight: '800', fontSize: 18, marginTop: 4 }}>{shop.offer}</RNText>
        </View>
      )}
      <View style={s.card}>
        <Text style={s.h}>🎁 New offer</Text>
        <Field label="Offer (shown to customers)" value={offer} onChangeText={setOffer} placeholder="Weekend special: 20% OFF" autoCapitalize="sentences" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {SAMPLES.map((x) => <Chip key={x} t={x} on={offer === x} color={PINK} onPress={() => setOffer(x)} />)}
        </View>
        <Btn t="Publish" onPress={() => save(offer.trim() || null)} style={{ marginTop: 6, backgroundColor: PINK }} />
        {!!shop.offer && <Btn kind="r" t="Remove offer" onPress={() => save(null)} style={{ marginTop: 8 }} />}
        <Text style={[s.sub, { marginTop: 8 }]}>Your offer appears on the buyer home banner, shop page and in buyer notifications.</Text>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Sales Report (calculated from the shop orders) ----
function SellerSales({ os, onBack }) {
  const ok = os.filter((o) => o.status !== 'cancelled');
  const today = new Date().toDateString();
  const sum = (l) => l.reduce((t, o) => t + Number(o.total || 0), 0);
  const tdy = ok.filter((o) => new Date(o.created_at).toDateString() === today);
  const delivered = os.filter((o) => o.status === 'delivered');
  const upi = ok.filter((o) => o.pay === 'upi');
  const cod = ok.filter((o) => o.pay !== 'upi' && o.pay !== 'khata');
  const khataOrders = ok.filter((o) => o.pay === 'khata');
  const byProd = {};
  ok.forEach((o) => (o.order_items || []).forEach((i) => {
    const k = i.name || 'Item';
    byProd[k] = byProd[k] || { n: 0, amt: 0 };
    byProd[k].n += 1; byProd[k].amt += Number(i.price) * Number(i.qty);
  }));
  const top = Object.keys(byProd).map((k) => ({ k, ...byProd[k] })).sort((a, b) => b.amt - a.amt).slice(0, 5);
  const maxAmt = top.length ? top[0].amt : 1;
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <SubHead title="Sales Report" sub={'Based on your latest ' + os.length + ' orders'} color={GREEN} onBack={onBack} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 14, paddingBottom: 4 }}>
        <StatTile ic="💰" v={money(sum(tdy))} label="Today's sales" bg="#dcf5e1" fg={GREEN} />
        <StatTile ic="📈" v={money(sum(ok))} label="Total sales" bg="#e3ecff" fg={BLUE} />
        <StatTile ic="🧾" v={ok.length} label="Orders (not cancelled)" bg="#fff0d6" />
        <StatTile ic="🎉" v={delivered.length} label="Delivered" bg="#e6e8ff" />
      </View>
      <View style={s.card}>
        <Text style={s.h}>Payment methods</Text>
        <View style={[s.rowB, { paddingVertical: 6 }]}><Text style={s.shopN}>💳 UPI</Text><Text style={s.price}>{upi.length + ' · ' + money(sum(upi))}</Text></View>
        <View style={[s.rowB, { paddingVertical: 6 }]}><Text style={s.shopN}>💵 Cash on Delivery</Text><Text style={s.price}>{cod.length + ' · ' + money(sum(cod))}</Text></View>
        <View style={[s.rowB, { paddingVertical: 6 }]}><Text style={s.shopN}>📒 Khata (Udhaar)</Text><Text style={s.price}>{khataOrders.length + ' · ' + money(sum(khataOrders))}</Text></View>
      </View>
      <View style={s.card}>
        <Text style={s.h}>🏆 Top selling products</Text>
        {top.length === 0 && <Text style={s.sub}>No sales yet.</Text>}
        {top.map((t) => (
          <View key={t.k} style={{ marginBottom: 10 }}>
            <View style={s.rowB}><RNText style={s.shopN} numberOfLines={1}>{t.k}</RNText><RNText style={s.price}>{money(t.amt)}</RNText></View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: '#e8eef9', marginTop: 4 }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: GREEN, width: Math.max(6, Math.round((t.amt / maxAmt) * 100)) + '%' }} />
            </View>
          </View>
        ))}
      </View>
      <View style={s.card}>
        <Text style={s.h}>Orders by status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {ALL_ST.map((k) => <Tag key={k} t={STATUS[k] + ': ' + os.filter((o) => o.status === k).length} kind={k === 'cancelled' ? 'r' : k === 'delivered' ? 'g' : 'b'} />)}
        </View>
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Customers Reviews ----
function SellerReviews({ shop, onBack }) {
  const rv = useShopReviews(shop.id, 0);
  const avg = avgRating(rv.list);
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: rv.list.filter((r) => Number(r.rating) === n).length }));
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <SubHead title="Customers Reviews" sub="What your customers say" color={AMBER} onBack={onBack} />
      <View style={[s.card, { alignItems: 'center', backgroundColor: '#fff8e6', borderColor: '#f3dca0' }]}>
        <RNText style={{ fontSize: 44, fontWeight: '800', color: INK }}>{rv.list.length ? avg : '—'}</RNText>
        <Stars v={avg} size={26} />
        <Text style={[s.sub, { marginTop: 4 }]}>{rv.list.length + ' reviews'}</Text>
      </View>
      {rv.list.length > 0 && (
        <View style={s.card}>
          {dist.map((d) => (
            <View key={d.n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <RNText style={{ width: 24, color: INK, fontWeight: '700' }}>{d.n + '★'}</RNText>
              <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e8eef9' }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: GOLD, width: (rv.list.length ? (d.c / rv.list.length) * 100 : 0) + '%' }} />
              </View>
              <RNText style={[s.sub, { width: 22, textAlign: 'right' }]}>{d.c}</RNText>
            </View>
          ))}
        </View>
      )}
      <Msg t={rv.err} />
      {rv.loading && <ActivityIndicator color={BLUE} style={{ margin: 20 }} />}
      {!rv.loading && rv.list.length === 0 && <Text style={s.empty}>No reviews yet.</Text>}
      {rv.list.map((r, i) => (
        <View key={i} style={s.card}>
          <View style={s.rowB}>
            <RNText style={s.shopN}>{r.customer_name || 'Customer'}</RNText>
            <RNText style={s.sub}>{r.created_at ? when(r.created_at) : ''}</RNText>
          </View>
          <Stars v={Number(r.rating)} size={16} />
          {!!r.comment && <RNText style={{ color: INK, marginTop: 6 }}>{r.comment}</RNText>}
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---- Seller notifications: new orders, low stock, vibration alert ----
function SellerNotifications({ os, products, vib, setVib, openOrder, goInventory, onBack }) {
  const fresh = os.filter((o) => o.status === 'new');
  const lowP = products.filter((p) => p.active !== false && Number(p.online_qty) <= Number(p.low_alert || 5));
  return (
    <ScrollView style={{ backgroundColor: BG }}>
      <SubHead title="Notification" sub="New orders and alerts" color={PINK} onBack={onBack} />
      <View style={[s.card, s.rowB]}>
        <View style={{ flex: 1 }}>
          <Text style={s.shopN}>📳 New order alert (vibration)</Text>
          <Text style={s.sub}>Phone vibrates when a new order arrives</Text>
        </View>
        <Switch value={vib} onValueChange={setVib} trackColor={{ true: PINK }} />
      </View>
      <Text style={[s.h, s.sec]}>🛍️ New orders ({fresh.length})</Text>
      {fresh.length === 0 && <Text style={[s.sub, { marginHorizontal: 14 }]}>No new orders right now.</Text>}
      {fresh.map((o) => (
        <NoteCard key={o.id} ic="🔔" bg="#fff3e3"
          title={'New order ' + orderNo(o) + ' · ' + money(o.total)}
          text={o.customer_name + ' · ' + (o.order_items || []).length + ' items · ' + (o.pay === 'upi' ? 'UPI' : o.pay === 'khata' ? 'Khata' : 'COD')}
          time={when(o.created_at) + ' · ' + minsLeft(o.created_at) + ' min left to respond'}
          onPress={() => openOrder(o.id)}
          right={<Btn small t="Open" onPress={() => openOrder(o.id)} />} />
      ))}
      <Text style={[s.h, s.sec]}>⚠️ Stock alerts ({lowP.length})</Text>
      {lowP.length === 0 && <Text style={[s.sub, { marginHorizontal: 14 }]}>All products have enough stock.</Text>}
      {lowP.slice(0, 8).map((p) => (
        <NoteCard key={p.id} ic="📦" bg="#fff8e6" title={p.name}
          text={Number(p.online_qty) <= 0 ? 'Out of stock' : 'Only ' + qtyLabel(Number(p.online_qty), p.unit) + ' left'}
          onPress={goInventory} right={<Photo url={p.image_url} name={p.name} size={44} />} />
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ---------- Seller: More tab = seller profile ----------
function SellerMore({ shop, setShop, lang, onLang, onLogout, os, products, reloadP, page, setPage, openOrder }) {
  const [vib, setVib] = useState(PREF.vib);
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ upi_id: shop.upi_id || null, qr_url: shop.qr_url || null });
  const [pmsg, setPmsg] = useState('');
  const [pbusy, setPbusy] = useState(false);
  const toggleVib = (v) => { PREF.vib = v; setVib(v); };
  const langName = (LANGS.find((l) => l[0] === lang) || LANGS[0])[1];
  const newCount = os.filter((o) => o.status === 'new').length;

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
  const changePhoto = async () => {
    setPmsg(''); setPbusy(true);
    try {
      const d = await pickShopPhoto();
      if (d) {
        await newRpc('update_my_shop_photo', { p_shop_id: shop.id, p_photo_url: d });
        setShop({ ...shop, photo_url: d }); setPmsg('✅ Shop photo saved');
      }
    } catch (e) { setPmsg(errMsg(e)); }
    setPbusy(false);
  };
  const back = () => setPage(null);

  if (page === 'manage') return <SellerManage shop={shop} setShop={setShop} onBack={back} />;
  if (page === 'hours') return <SellerHours shop={shop} setShop={setShop} onBack={back} />;
  if (page === 'delivery') return <SellerDelivery shop={shop} onBack={back} />;
  if (page === 'khata') return <SellerKhata shop={shop} onBack={back} />;
  if (page === 'fees') return <SellerFees shop={shop} onBack={back} />;
  if (page === 'cats') return <SellerCategories shop={shop} products={products} onBack={back} onManage={() => setPage('manage')} />;
  if (page === 'inventory') return <SellerInventory shop={shop} products={products} reloadP={reloadP} onBack={back} />;
  if (page === 'deals') return <SellerDeals shop={shop} setShop={setShop} onBack={back} />;
  if (page === 'sales') return <SellerSales os={os} onBack={back} />;
  if (page === 'reviews') return <SellerReviews shop={shop} onBack={back} />;
  if (page === 'support') return <SupportPage onBack={back} color={TEAL} />;
  if (page === 'privacy') return <PrivacyPolicyPage onBack={back} color={BLUE} />;
  if (page === 'notif') {
    return <SellerNotifications os={os} products={products} vib={vib} setVib={toggleVib}
      openOrder={openOrder} goInventory={() => setPage('inventory')} onBack={back} />;
  }

  return (
    <ScrollView style={{ backgroundColor: BG }}>
      {/* hero */}
      <View style={[s.head, { paddingBottom: 70, alignItems: 'center' }]}>
        <TouchableOpacity onPress={changePhoto} activeOpacity={0.85} disabled={pbusy}>
          <View style={{ borderWidth: 3, borderColor: LIME, borderRadius: 45, padding: 2 }}>
            <Photo url={shop.photo_url} name={shop.name} size={80} round />
          </View>
          <View style={[s.camBadge, { right: 0, bottom: 0 }]}><RNText style={{ fontSize: 14 }}>{pbusy ? '⏳' : '📷'}</RNText></View>
        </TouchableOpacity>
        <RNText style={{ color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 12 }} numberOfLines={1}>
          {shop.name + ' ✔'}
        </RNText>
        <RNText style={{ color: '#cfdcf7', marginTop: 4 }} numberOfLines={1}>{catLabel(shop) + ' · ' + shop.area}</RNText>
        <RNText style={{ color: '#cfdcf7', marginTop: 4, fontSize: 12 }}>Tap the photo to change shop photo</RNText>
        <View style={[s.pill, { backgroundColor: shop.is_open ? '#dcf5e1' : '#fbe0db', marginTop: 10 }]}>
          <Text style={{ fontWeight: '800', color: shop.is_open ? '#0a6b3f' : '#9a2314' }}>{shop.is_open ? '● Open' : '● Closed'}</Text>
        </View>
      </View>

      {/* payment account card (overlapping the hero) */}
      <View style={[s.card, { marginTop: -48, padding: 18 }]}>
        <Msg t={pmsg} ok={pmsg.startsWith('✅')} />
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
        <View style={{ height: 10 }} />
        <Btn t={hasPay ? 'Edit UPI ID & QR code' : 'Add UPI ID & QR code'} onPress={() => { setPmsg(''); setPayOpen(true); }}
          style={{ minHeight: 48 }} />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 0 }]}>Shop Management</Text>
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <MenuRow ic="🏪" bg="#e3ecff" title="Manage Your Shop" sub="Shop photo, details and categories" onPress={() => setPage('manage')} />
        <MenuRow ic="🕒" bg="#fff0d6" title="Business Hours" sub="Set open hours and holidays" onPress={() => setPage('hours')} />
        <MenuRow ic="🚚" bg="#d9f8ec" title="Delivery and Pickup" sub="Manage delivery zones and pickup options" onPress={() => setPage('delivery')} />
        <MenuRow ic="📍" bg="#e1f7e3" title="Area Delivery Charges" sub="Set delivery fees for different areas" onPress={() => setPage('fees')} />
        <MenuRow ic="📒" bg="#fff0d6" title="Khata Management" sub="Approve customers and manage credit payments" onPress={() => setPage('khata')} />
        <MenuRow ic="💳" bg="#e6e8ff" title="Payment Account" sub="Manage UPI ID and payment QR code" onPress={() => { setPmsg(''); setPayOpen(true); }} last />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 0 }]}>Products & Sales</Text>
      <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
        <MenuRow ic="🗂️" bg="#ece4fb" title="Categories" sub="Manage your product categories" onPress={() => setPage('cats')} />
        <MenuRow ic="📦" bg="#d9f6ff" title="Inventory" sub="Track stock and manage inventory" onPress={() => setPage('inventory')} />
        <MenuRow ic="🏷️" bg="#fde4ea" title="Deals and Offers" sub="Create and manage deals and discounts" onPress={() => setPage('deals')} />
        <MenuRow ic="📈" bg="#e1f7e3" title="Sales Report" sub="View sales performance and reports" onPress={() => setPage('sales')} />
        <MenuRow ic="⭐" bg="#fff3c4" title="Customers Reviews" sub="View customer ratings and feedback" onPress={() => setPage('reviews')} last />
      </View>

      <Text style={[s.h, { marginHorizontal: 14, marginTop: 14, marginBottom: 8 }]}>Support & Account</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
        paddingHorizontal: 14 }}>
        <ProfTile ic="🔔" bg="#fde4ea" title="Notification" sub="New orders & stock alerts" badge={newCount > 0 ? newCount : null}
          onPress={() => setPage('notif')} />
        <ProfTile ic="🌐" bg="#e3ecff" title="Language" sub={langName} onPress={() => onLang('pick')} />
        <ProfTile ic="🎧" bg="#dcf5e9" title="Customer Support" sub={SUPPORT_PHONE} onPress={() => setPage('support')} />
        <ProfTile ic="🔒" bg="#e3ecff" title="Privacy Policy" sub="How NearKart uses your information" onPress={() => setPage('privacy')} />
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

function SellerSubscription({ shop, setShop, onClose }) {
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState([]);
  const load = useCallback(() => {
    newRpc('get_my_shop_subscription_payments', { p_shop_id: shop.id })
      .then((r) => setHistory(unwrapList(r)))
      .catch((e) => setMsg(errMsg(e)));
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);
  const payNow = async () => {
    const clean = utr.trim().replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6,32}$/.test(clean)) { setMsg('Enter the UTR / transaction reference from your UPI payment.'); return; }
    setBusy(true); setMsg('');
    try {
      await newRpc('submit_shop_subscription_payment', { p_shop_id: shop.id, p_utr: clean });
      setUtr('');
      setMsg('Payment request submitted. Admin will verify the bank credit and approve it.');
      load();
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  const openUpi = () => {
    const url = 'upi://pay?pa=9090197580%40ybl&pn=NearKart&am=29&cu=INR&tn=NearKart%2030-day%20subscription';
    Linking.openURL(url).catch(() => setMsg('UPI app could not be opened. Pay manually to the UPI ID shown below.'));
  };
  const refreshShop = async () => {
    setBusy(true); setMsg('');
    try {
      let r = await shopRpc('mine');
      if (Array.isArray(r)) r = r[0];
      if (r && r.id) {
        setShop(r);
        if (r.subscription_status === 'active' && r.subscription_expires_at && new Date(r.subscription_expires_at).getTime() > Date.now()) {
          setMsg('Subscription active. Your shop is now enabled.');
          onClose();
        } else {
          setMsg('Still waiting for admin verification. Please check again later.');
        }
      }
    } catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[s.head, { backgroundColor: PURPLE }]}>
          <View style={s.rowB}>
            <View style={{ flex: 1 }}>
              <Text style={s.headT}>Shop Subscription</Text>
              <Text style={{ color: '#e6eeff', marginTop: 4 }}>{shop.name || 'Your shop'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }}>
              <RNText style={{ color: '#fff', fontSize: 25, fontWeight: '800' }}>✕</RNText>
            </TouchableOpacity>
          </View>
        </View>
        <View style={[s.card, { borderColor: PURPLE, borderWidth: 1.5 }]}>
          <Text style={[s.h, { color: PURPLE }]}>₹29 / 30 days</Text>
          <Text style={s.sub}>NearKart seller subscription</Text>
          <RNText style={{ color: INK, lineHeight: 22, marginTop: 10 }}>
            Your subscription helps keep your shop active on the NearKart marketplace. With an active subscription, your shop can be visible to buyers, you can add and publish products, and you can accept incoming orders.
          </RNText>
          <RNText style={{ color: INK, lineHeight: 22, marginTop: 8 }}>
            After 30 days the subscription expires. Your shop and products will be hidden from buyers until you renew. You must have an active subscription to publish products or accept orders.
          </RNText>
        </View>
        <View style={s.card}>
          <Text style={s.h}>1. Pay ₹29 using UPI</Text>
          <Text style={s.sub}>Tap below to open your UPI app, or pay manually to this UPI ID.</Text>
          <RNText selectable style={{ color: INK, fontSize: 16, fontWeight: '800', marginVertical: 12 }}>
            9090197580@ybl
          </RNText>
          <Btn t="Pay ₹29 with UPI" onPress={openUpi} />
          <Text style={[s.sub, { marginTop: 10 }]}>Make sure the payment is successful before submitting the UTR.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.h}>2. Submit payment reference</Text>
          <Field label="UPI UTR / Transaction Reference" value={utr} onChangeText={setUtr}
            autoCapitalize="characters" placeholder="Enter UTR number" />
          <Btn t={busy ? 'Please wait...' : 'Submit payment for verification'} onPress={payNow} disabled={busy} />
          <Text style={[s.sub, { marginTop: 9 }]}>
            UTR submission is not automatic approval. NearKart admin will check the actual bank credit. Your 30 days start only after admin approval.
          </Text>
          <Msg t={msg} />
          <View style={{ marginTop: 10 }}>
            <Btn kind="o" t={busy ? 'Please wait...' : 'Refresh approval status'} onPress={refreshShop} disabled={busy} />
          </View>
        </View>
        {history.length > 0 && (
          <View style={s.card}>
            <Text style={s.h}>Payment request history</Text>
            {history.map((p) => (
              <View key={p.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: LINE }}>
                <RNText style={{ color: INK, fontWeight: '700' }}>₹{p.amount} · {p.status.toUpperCase()}</RNText>
                <RNText style={s.sub}>UTR: {p.utr} · {p.submitted_at ? new Date(p.submitted_at).toLocaleString() : ''}</RNText>
                {!!p.review_note && <RNText style={s.sub}>{p.review_note}</RNText>}
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ======================================================================
// SELLER APP (Partner Hub)
// ======================================================================
function SellerApp({ shop, setShop, lang, onLang, onLogout }) {
  const [tab, setTab] = useState('dash');
  const [selId, setSelId] = useState(null);
  const [morePage, setMorePage] = useState(null);
  const [products, setProducts] = useState([]);
  const [perr, setPerr] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const isSubActive = shop.subscription_status === 'active' &&
    !!shop.subscription_expires_at && new Date(shop.subscription_expires_at).getTime() > Date.now();
  const [subscriptionOpen, setSubscriptionOpen] = useState(!isSubActive);
  const { os, load, err: oerr, alertMsg, clearAlert, hasMore, loadMore } = useOrders(shop.id);
  const reloadP = useCallback(() => {
    rpc('seller_get_products', { p_shop_id: shop.id })
      .then((r) => { setProducts(unwrapList(r)); setPerr(''); })
      .catch((e) => setPerr(errMsg(e)));
  }, [shop.id]);
  useEffect(() => { reloadP(); }, [reloadP]);
  useEffect(() => { if (isSubActive) setSubscriptionOpen(false); }, [isSubActive]);
  const newCount = os.filter((o) => o.status === 'new').length;
  const pick = (k) => {
    if (k === 'add') {
      if (!isSubActive) { setSubscriptionOpen(true); return; }
      setTab('products'); setAddOpen(true); return;
    }
    setSelId(null); if (k === 'more') setMorePage(null); setTab(k);
  };
  const goTab = (k) => { setSelId(null); setTab(k); };
  const openOrder = (id) => { setTab('orders'); setSelId(id); };
  const openNotif = () => { setSelId(null); setMorePage('notif'); setTab('more'); };
  let body = null;
  if (tab === 'dash') {
    body = <SellerDash shop={shop} setShop={setShop} os={os} products={products}
      goTab={goTab} openOrder={openOrder} reloadP={reloadP} ordersErr={oerr} onBell={openNotif} />;
  } else if (tab === 'orders') {
    body = <SellerOrders os={os} load={load} selId={selId} setSel={setSelId} err0={oerr}
      hasMore={hasMore} loadMore={loadMore} />;
  } else if (tab === 'products') {
    body = <SellerProducts shop={shop} setShop={setShop} products={products} reloadP={reloadP}
      addOpen={addOpen} setAddOpen={setAddOpen} perr={perr} canManage={isSubActive}
      onRequireSubscription={() => setSubscriptionOpen(true)} />;
  } else {
    body = <SellerMore shop={shop} setShop={setShop} lang={lang} onLang={onLang} onLogout={onLogout}
      os={os} products={products} reloadP={reloadP} page={morePage} setPage={setMorePage} openOrder={openOrder} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {subscriptionOpen ? (
        <SellerSubscription shop={shop} setShop={setShop} onClose={() => setSubscriptionOpen(false)} />
      ) : (
        <>
          {!isSubActive && (
            <TouchableOpacity onPress={() => setSubscriptionOpen(true)}
              style={{ backgroundColor: '#fff3d6', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0d79b' }}>
              <RNText style={{ color: '#8a5700', fontWeight: '800' }}>
                {shop.subscription_status === 'active' ? 'Subscription expired' : 'Subscription required'} · ₹29 / 30 days · Tap to pay or check status
              </RNText>
            </TouchableOpacity>
          )}
          {!!alertMsg && (
            <TouchableOpacity style={s.alertBar} onPress={() => { clearAlert(); setSelId(null); setTab('orders'); }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{alertMsg}</Text>
              <Text style={{ color: '#fff' }}>Tap to view</Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>{body}</View>
          <TabBar cur={tab} onPick={pick} tabs={[
            ['dash', '📊', 'Dashboard'],
            ['orders', '📋', 'Orders', newCount > 0 ? newCount : null],
            ['add', '➕', 'Add'],
            ['products', '📦', 'Products'],
            ['more', '⋯', 'More'],
          ]} />
        </>
      )}
    </View>
  );
}

const payShort = (o) => (o.pay === 'upi' ? 'UPI' : o.pay === 'khata' ? 'Khata' : 'Cash on Delivery');

// find the delivery fee of the buyer's area (longest matching area name wins)
function matchFee(fees, text) {
  const norm = (v) => String(v || '').trim().toLowerCase().replace(/\\s+/g, ' ');
  const t = norm(text);
  let best = null;
  (fees || []).forEach((f) => {
    const a = norm(f.area);
    if (a && t.indexOf(a) >= 0 && (!best || a.length > norm(best.area).length)) best = f;
  });
  return best;
}

// ---- ledger list (orders + payments) ----
function LedgerList({ entries }) {
  if (!entries.length) return <Text style={s.sub}>No entries yet.</Text>;
  return (
    <View>
      {entries.map((e, i) => (
        <View key={i} style={[s.rowB, { paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: LINE }]}>
          <View style={{ flex: 1 }}>
            <RNText style={s.shopN}>{e.kind === 'order' ? '🧾 Order ' + (e.ref ? '#' + e.ref : '') : '💵 Payment'}</RNText>
            <RNText style={s.sub}>{when(e.at)}{e.note ? ' · ' + e.note : ''}</RNText>
          </View>
          <RNText style={{ fontWeight: '800', color: e.kind === 'order' ? RED : GREEN }}>
            {(e.kind === 'order' ? '+ ' : '- ') + money(Number(e.amount))}
          </RNText>
        </View>
      ))}
    </View>
  );
}

// ---- Buyer: apply for Khata on a shop page ----
function KhataApply({ shop, profile }) {
  const [st, setSt] = useState(null);
  const [bal, setBal] = useState(0);
  const [expiresAt, setExpiresAt] = useState(null);
  const [limitExpired, setLimitExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    if (!SESSION) { setSt(''); return; }
    newRpc('khata_my_status', { p_shop_id: shop.id })
      .then((r) => { const x = Array.isArray(r) ? r[0] : r; setSt((x && x.status) || ''); setBal(Number((x && x.balance) || 0)); setExpiresAt(x && x.credit_limit_expires_at || null); setLimitExpired(!x || x.limit_expired === true); })
      .catch(() => setSt(''));
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);
  const apply = async () => {
    if (!SESSION) { Alert.alert('Khata', 'Please login from Profile to apply for Khata.'); return; }
    const name = ((profile && profile.name) || '').trim(), phone = ((profile && profile.phone) || '').trim();
    if (!name || !/^\d{10}$/.test(phone)) { setMsg('Please save your name and 10-digit phone in Profile > Saved Addresses first.'); return; }
    setBusy(true); setMsg('');
    try { await newRpc('khata_apply', { p_shop_id: shop.id, p_name: name, p_phone: phone }); load(); }
    catch (e) { setMsg(errMsg(e)); }
    setBusy(false);
  };
  if (st === null) return null;
  return (
    <View style={[s.card, { backgroundColor: '#fff8e6', borderColor: '#f3dca0' }]}>
      <View style={s.rowB}>
        <Text style={s.h}>📒 Khata (pay later)</Text>
        {st === 'approved' && <Tag t="✔ Approved" kind="g" />}
        {st === 'pending' && <Tag t="Waiting for shop" kind="y" />}
        {st === 'rejected' && <Tag t="Rejected" kind="r" />}
      </View>
      {st === 'approved' && (
        <View>
          <RNText style={s.sub}>{'Current due: ' + money(bal)}</RNText>
          <RNText style={[s.sub, { marginTop: 4, color: limitExpired ? RED : GREEN }]}>
            {limitExpired ? 'Your one-month credit limit has expired. Ask the shop to set a new limit.' :
              'Credit limit valid until ' + (expiresAt ? new Date(expiresAt).toLocaleString() : '—') + '. You can use Khata at checkout while credit is available.'}
          </RNText>
        </View>
      )}
      {st === 'pending' && <Text style={s.sub}>The shop owner will approve or reject your request.</Text>}
      {(st === '' || st === 'rejected') && (
        <View>
          <Text style={s.sub}>Apply to buy on credit from this shop and pay later.</Text>
          <Btn small t={busy ? 'Please wait...' : st === 'rejected' ? 'Apply again' : 'Apply for Khata'} onPress={apply}
            disabled={busy} style={{ marginTop: 8, alignSelf: 'flex-start' }} />
        </View>
      )}
      <Msg t={msg} />
    </View>
  );
}

// ---- Buyer: Khata page (all shops, dues, UPI ID + QR to pay) ----
function BuyerKhata({ session, onBack }) {
  const [list, setList] = useState([]);
  const [ld, setLd] = useState(false);
  const [err, setErr] = useState('');
  const [payA, setPayA] = useState(null);       // account whose UPI details are shown
  const [payInfo, setPayInfo] = useState(null);
  const [payLd, setPayLd] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [led, setLed] = useState(null);         // account whose ledger is shown
  const [entries, setEntries] = useState([]);
  const [ledLd, setLedLd] = useState(false);
  const [ledErr, setLedErr] = useState('');
  const load = useCallback(() => {
    if (!session) { setList([]); return; }
    setLd(true);
    kRpc(KHATA.myAccounts())
      .then((r) => { setList(unwrapList(r)); setErr(''); })
      .catch((e) => setErr(errMsg(e))).finally(() => setLd(false));
  }, [session]);
  useEffect(() => { load(); }, [load]);
  const openPay = (a) => {
    setPayA(a); setPayInfo(null); setPayErr(''); setPayLd(true);
    rpc('get_shop_payment', { p_shop_id: a.shop_id })
      .then((r) => { const x = Array.isArray(r) ? r[0] : r; setPayInfo(x && typeof x === 'object' ? x : null); })
      .catch((e) => setPayErr(errMsg(e))).finally(() => setPayLd(false));
  };
  const openLedger = (a) => {
    setLed(a); setEntries([]); setLedErr(''); setLedLd(true);
    kRpc(KHATA.ledger(a.account_id))
      .then((r) => setEntries(unwrapList(r)))
      .catch((e) => setLedErr(errMsg(e))).finally(() => setLedLd(false));
  };
  const upi = payInfo && payInfo.upi_id ? String(payInfo.upi_id) : '';
  const qr = payInfo && payInfo.qr_url ? String(payInfo.qr_url) : '';
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ backgroundColor: BG }} refreshControl={<RefreshControl refreshing={ld} onRefresh={load} />}>
        <Head title="My Khata" sub="Credit balance and payment history" color={AMBER} onBack={onBack} />
        {!session && <Text style={s.empty}>Login or sign up to continue</Text>}
        <Msg t={err} />
        {session && !ld && !err && list.length === 0 && (
          <Text style={s.empty}>No Khata accounts yet. Open a shop and tap "Apply for Khata".</Text>
        )}
        {list.map((a) => (
          <View key={a.account_id} style={s.card}>
            <View style={s.rowB}>
              <RNText style={[s.shopN, { flex: 1 }]} numberOfLines={1}>{a.shop_name || 'Shop'}</RNText>
              {a.status === 'approved' && <Tag t="✔ Approved" kind="g" />}
              {a.status === 'pending' && <Tag t="Waiting for shop" kind="y" />}
              {a.status === 'rejected' && <Tag t="Rejected" kind="r" />}
            </View>
            {a.status === 'approved' && (
              <View>
                <View style={[s.rowB, { marginTop: 8 }]}>
                  <Text style={s.sub}>Due amount</Text>
                  <RNText style={{ fontSize: 20, fontWeight: '800', color: Number(a.balance) > 0 ? RED : GREEN }}>{money(Number(a.balance || 0))}</RNText>
                </View>
                {a.credit_limit !== undefined && a.credit_limit !== null && (
                  <View style={[s.rowB, { marginTop: 6 }]}>
                    <Text style={s.sub}>Credit limit</Text>
                    <RNText style={{ color: INK, fontWeight: '700' }}>{money(Number(a.credit_limit))}</RNText>
                  </View>
                )}
                {a.credit_limit !== undefined && a.credit_limit !== null && (
                  <View style={[s.rowB, { marginTop: 6 }]}>
                    <Text style={s.sub}>Available credit</Text>
                    <RNText style={{ color: a.limit_expired ? RED : GREEN, fontWeight: '700' }}>
                      {money(a.limit_expired ? 0 : Math.max(0, Number(a.credit_limit) - Number(a.balance || 0)))}
                    </RNText>
                  </View>
                )}
                <RNText style={[s.sub, { marginTop: 5, color: a.limit_expired ? RED : MUTE }]}>
                  {a.limit_expired ? 'Credit limit expired · ask shop to renew' :
                    'Limit valid until ' + (a.credit_limit_expires_at ? new Date(a.credit_limit_expires_at).toLocaleString() : '—')}
                </RNText>
                {!!a.next_reminder_at && (
                  <RNText style={[s.sub, { marginTop: 5, color: AMBER }]}>
                    {'Payment reminder: ' + new Date(a.next_reminder_at).toLocaleString() + (a.reminder_note ? ' · ' + a.reminder_note : '')}
                  </RNText>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Btn kind="g" t="Pay now" style={{ flex: 1.2 }} onPress={() => openPay(a)} />
                  <Btn kind="o" t="Ledger" style={{ flex: 1 }} onPress={() => openLedger(a)} />
                </View>
              </View>
            )}
          </View>
        ))}
        <View style={{ height: 30 }} />
      </ScrollView>
      {payA && (
        <Sheet onClose={() => setPayA(null)}>
          <View style={s.rowB}>
            <Text style={s.h}>Pay {payA.shop_name || 'shop'}</Text>
            <TouchableOpacity onPress={() => setPayA(null)}><Text style={{ color: MUTE }}>Close</Text></TouchableOpacity>
          </View>
          <RNText style={s.sub}>{'Due ' + money(Number(payA.balance || 0))}</RNText>
          {payLd && <ActivityIndicator color={BLUE} style={{ margin: 16 }} />}
          <Msg t={payErr} />
          {!payLd && !payErr && !upi && !qr && (
            <Msg t="This shop has not added UPI details yet. Please pay the shop directly." />
          )}
          {!payLd && !payErr && (!!upi || !!qr) && (
            <View style={{ alignItems: 'center', marginTop: 12 }}>
              {!!qr && <QrImage url={qr} />}
              {!!upi && (
                <View style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={s.sub}>UPI ID</Text>
                  <RNText selectable style={{ fontSize: 17, fontWeight: '800', color: INK, marginTop: 2 }}>{upi}</RNText>
                  <Btn small kind="o" t="Open UPI app" onPress={() => openUpi(upi, payA.shop_name, Number(payA.balance || 0))}
                    style={{ marginTop: 8 }} />
                </View>
              )}
              <Text style={[s.sub, { marginTop: 12, textAlign: 'center' }]}>After paying, tell the shop so they can record your payment.</Text>
            </View>
          )}
        </Sheet>
      )}
      {led && (
        <Sheet onClose={() => setLed(null)}>
          <View style={s.rowB}>
            <Text style={s.h}>{led.shop_name || 'Shop'}</Text>
            <TouchableOpacity onPress={() => setLed(null)}><Text style={{ color: MUTE }}>Close</Text></TouchableOpacity>
          </View>
          {ledLd && <ActivityIndicator color={BLUE} style={{ margin: 16 }} />}
          <Msg t={ledErr} />
          <ScrollView style={{ maxHeight: 380 }}><LedgerList entries={entries} /></ScrollView>
        </Sheet>
      )}
    </View>
  );
}

// ---- Seller: Khata Management (approve customers, credit limit, payments, ledger) ----
function SellerKhata({ shop, onBack }) {
  const [list, setList] = useState([]);
  const [tab, setTab] = useState('pending');
  const [ld, setLd] = useState(true);
  const [msg, setMsg] = useState('');
  const [limitA, setLimitA] = useState(null);
  const [limitVal, setLimitVal] = useState('');
  const [payA, setPayA] = useState(null);
  const [reminderA, setReminderA] = useState(null);
  const [reminderAt, setReminderAt] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [led, setLed] = useState(null);
  const [entries, setEntries] = useState([]);
  const load = useCallback(() => {
    setLd(true);
    kRpc(KHATA.shopAccounts(shop.id))
      .then((r) => setList(unwrapList(r)))
      .catch((e) => setMsg(errMsg(e))).finally(() => setLd(false));
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);
  const shown = list.filter((a) => a.status === tab);
  const decide = async (a, ok) => {
    setMsg('');
    try { await kRpc(KHATA.decide(a.account_id, ok)); setMsg('✅ Saved'); load(); }
    catch (e) { setMsg(errMsg(e)); }
  };
  const openLimit = (a) => {
    setMsg(''); setLimitA(a);
    setLimitVal(a.credit_limit !== undefined && a.credit_limit !== null ? String(a.credit_limit) : '');
  };
  const saveLimit = async () => {
    const v = Number(limitVal);
    if (limitVal === '' || !Number.isFinite(v) || v < 0) { setMsg('Enter a valid credit limit'); return; }
    try { await kRpc(KHATA.setLimit(limitA.account_id, v)); setLimitA(null); setMsg('✅ Saved'); load(); }
    catch (e) { setMsg(errMsg(e)); }
  };
  const openPay = (a) => { setMsg(''); setAmt(''); setNote(''); setPayA(a); };
  const openReminder = (a) => {
    setMsg(''); setReminderA(a); setReminderNote('');
    setReminderAt('');
  };
  const saveReminder = async () => {
    if (!reminderA) return;
    const raw = reminderAt.trim();
    const parsed = new Date(raw.replace(' ', 'T'));
    if (!raw || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      setMsg('Enter a future date and time in YYYY-MM-DD HH:mm format'); return;
    }
    try {
      await kRpc(KHATA.setReminder(reminderA.account_id, parsed.toISOString(), reminderNote.trim()));
      setReminderA(null); setMsg('✅ Payment reminder scheduled for buyer'); load();
    } catch (e) { setMsg(errMsg(e)); }
  };
  const record = async () => {
    const v = Number(amt);
    if (!(v > 0)) { setMsg('Enter the amount received'); return; }
    try { await kRpc(KHATA.record(payA.account_id, v, note.trim())); setPayA(null); setMsg('✅ Saved'); load(); }
    catch (e) { setMsg(errMsg(e)); }
  };
  const openLedger = (a) => {
    setLed(a); setEntries([]);
    kRpc(KHATA.ledger(a.account_id))
      .then((r) => setEntries(unwrapList(r)))
      .catch((e) => setMsg(errMsg(e)));
  };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
        <Head title="Khata Management" sub="Approve customers and manage credit payments" color={AMBER} onBack={onBack} />
        <Msg t={msg} ok={msg.startsWith('✅')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 14, paddingBottom: 4 }}>
          {[['pending', 'Requests'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([k, t]) => (
            <Chip key={k} color={AMBER} t={t + ' ' + list.filter((a) => a.status === k).length} on={tab === k} onPress={() => setTab(k)} />
          ))}
        </View>
        {ld && <ActivityIndicator color={BLUE} style={{ margin: 20 }} />}
        {!ld && shown.length === 0 && <Text style={s.empty}>No customers in this list.</Text>}
        {shown.map((a) => (
          <View key={a.account_id} style={s.card}>
            <View style={s.rowB}>
              <View style={{ flex: 1 }}>
                <RNText style={s.shopN}>{a.customer_name || 'Customer'}</RNText>
                <RNText style={s.sub}>{a.customer_phone || ''}</RNText>
              </View>
              {!!a.customer_phone && <Btn small kind="o" t="Call" onPress={() => callPhone(a.customer_phone)} />}
            </View>
            {a.status === 'approved' && (
              <View>
                <View style={[s.rowB, { marginTop: 8 }]}>
                  <Text style={s.sub}>Due amount</Text>
                  <RNText style={{ fontSize: 20, fontWeight: '800', color: Number(a.balance) > 0 ? RED : GREEN }}>{money(Number(a.balance || 0))}</RNText>
                </View>
                {a.credit_limit !== undefined && a.credit_limit !== null && (
                  <View style={[s.rowB, { marginTop: 6 }]}>
                    <Text style={s.sub}>Credit limit</Text>
                    <RNText style={{ color: INK, fontWeight: '700' }}>{money(Number(a.credit_limit))}</RNText>
                  </View>
                )}
                <RNText style={[s.sub, { marginTop: 5, color: a.limit_expired ? RED : GREEN }]}>
                  {a.limit_expired ? 'Limit expired · set a new one-month limit' :
                    'Limit valid until ' + (a.credit_limit_expires_at ? new Date(a.credit_limit_expires_at).toLocaleString() : '—')}
                </RNText>
                {!!a.next_reminder_at && (
                  <RNText style={[s.sub, { marginTop: 5, color: AMBER }]}>
                    {'Reminder: ' + new Date(a.next_reminder_at).toLocaleString()}
                  </RNText>
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <Btn kind="g" t="Payment received" style={{ flex: 1.4 }} onPress={() => openPay(a)} />
                  <Btn kind="o" t="Limit" style={{ flex: 1 }} onPress={() => openLimit(a)} />
                  <Btn kind="o" t="Reminder" style={{ flex: 1 }} onPress={() => openReminder(a)} />
                  <Btn kind="o" t="Ledger" style={{ flex: 1 }} onPress={() => openLedger(a)} />
                </View>
              </View>
            )}
            {a.status === 'pending' && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Btn kind="g" t="Approve" style={{ flex: 1.3 }} onPress={() => decide(a, true)} />
                <Btn kind="r" t="Reject" style={{ flex: 1 }} onPress={() => decide(a, false)} />
              </View>
            )}
            {a.status === 'rejected' && (
              <View style={{ marginTop: 12 }}>
                <Btn small kind="g" t="Approve now" onPress={() => decide(a, true)} style={{ alignSelf: 'flex-start' }} />
              </View>
            )}
          </View>
        ))}
        <View style={{ height: 30 }} />
      </ScrollView>
      {limitA && (
        <Sheet onClose={() => setLimitA(null)}>
          <Text style={s.h}>Set Customer Credit Limit</Text>
          <RNText style={s.sub}>{limitA.customer_name || 'Customer'}</RNText>
          <View style={{ height: 12 }} />
          <Field label="Credit Limit (₹)" value={limitVal} onChangeText={setLimitVal}
            keyboardType="decimal-pad" placeholder="Example: 2000" />
          <Text style={s.sub}>This credit limit is valid for one month from the time you save it. After expiry, set a new limit. Outstanding dues remain payable.</Text>
          <Msg t={msg && !msg.startsWith('✅') ? msg : ''} />
          <Btn kind="g" t="Save Credit Limit" onPress={saveLimit} style={{ minHeight: 50, marginTop: 12 }} />
        </Sheet>
      )}
      {reminderA && (
        <Sheet onClose={() => setReminderA(null)}>
          <Text style={s.h}>Set payment reminder</Text>
          <RNText style={s.sub}>{(reminderA.customer_name || 'Customer') + ' · Due ' + money(Number(reminderA.balance || 0))}</RNText>
          <View style={{ height: 10 }} />
          <Field label="Reminder date & time (YYYY-MM-DD HH:mm)" value={reminderAt}
            onChangeText={setReminderAt} placeholder="2026-11-20 18:00" autoCapitalize="none" />
          <Field label="Note (optional)" value={reminderNote} onChangeText={setReminderNote}
            placeholder="Please clear your Khata due" autoCapitalize="sentences" />
          <Text style={s.sub}>The buyer will receive a NearKart notification at this time.</Text>
          <Msg t={msg && !msg.startsWith('✅') ? msg : ''} />
          <Btn kind="g" t="Schedule reminder" onPress={saveReminder} style={{ minHeight: 50, marginTop: 10 }} />
        </Sheet>
      )}
      {payA && (
        <Sheet onClose={() => setPayA(null)}>
          <Text style={s.h}>Payment received</Text>
          <RNText style={s.sub}>{(payA.customer_name || 'Customer') + ' · Due ' + money(Number(payA.balance || 0))}</RNText>
          <View style={{ height: 10 }} />
          <Field label="Amount received (₹)" value={amt} onChangeText={setAmt} keyboardType="decimal-pad" />
          <Field label="Note (optional)" value={note} onChangeText={setNote} autoCapitalize="sentences" />
          <Msg t={msg && !msg.startsWith('✅') ? msg : ''} />
          <Btn kind="g" t="Save payment" onPress={record} style={{ minHeight: 50 }} />
        </Sheet>
      )}
      {led && (
        <Sheet onClose={() => setLed(null)}>
          <View style={s.rowB}>
            <Text style={s.h}>{led.customer_name || 'Customer'}</Text>
            <TouchableOpacity onPress={() => setLed(null)}><Text style={{ color: MUTE }}>Close</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 380 }}><LedgerList entries={entries} /></ScrollView>
        </Sheet>
      )}
    </View>
  );
}

// ---- Seller: area wise delivery charges ----
function SellerFees({ shop, onBack }) {
  const [list, setList] = useState([]);
  const [area, setArea] = useState('');
  const [morning, setMorning] = useState('');
  const [afternoon, setAfternoon] = useState('');
  const [evening, setEvening] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => {
    newRpc('shop_fees_get', { p_shop_id: shop.id }).then((r) => setList(unwrapList(r))).catch((e) => setMsg(errMsg(e)));
  }, [shop.id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const m = Number(morning), a = Number(afternoon), e = Number(evening);
    if (!area.trim()) { setMsg('Enter the delivery area name'); return; }
    if ([morning, afternoon, evening].some((v) => v === '') || [m,a,e].some((v) => !Number.isFinite(v) || v < 0 || v > 10000)) {
      setMsg('Enter a valid charge for all three time slots'); return;
    }
    try {
      await newRpc('shop_fee_save_slots', { p_shop_id: shop.id, p_area: area.trim(), p_morning_fee: m, p_afternoon_fee: a, p_evening_fee: e });
      setArea(''); setMorning(''); setAfternoon(''); setEvening('');
      setMsg('✅ Delivery charges saved successfully'); load();
    } catch (err) { setMsg(errMsg(err)); }
  };
  const del = (x) => Alert.alert(x.area, 'Remove this delivery area?', [
    { text: trs('No'), style: 'cancel' },
    { text: trs('Yes'), style: 'destructive', onPress: async () => {
      try { await newRpc('shop_fee_delete', { p_id: x.id }); load(); } catch (err) { setMsg(errMsg(err)); }
    } },
  ]);
  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: BG }}>
      <Head title="Area & Time-Based Delivery Charges" sub="Set separate delivery charges for each service area" color={GREEN} onBack={onBack} />
      <Msg t={msg} ok={msg.startsWith('✅')} />
      <View style={s.card}>
        <Text style={s.h}>➕ Add delivery area</Text>
        <Field label="Area / locality name" value={area} onChangeText={setArea} autoCapitalize="words" placeholder="e.g. Balasore Town, Remuna or Soro" />
        <Text style={[s.sub,{marginTop:8,marginBottom:8,fontWeight:'700'}]}>Set delivery charges by order placement time (IST)</Text>
        <Field label="Morning · 6:00 AM–12:00 PM (₹)" value={morning} onChangeText={setMorning} keyboardType="decimal-pad" placeholder="e.g. 20" />
        <Field label="Afternoon · 12:00 PM–6:00 PM (₹)" value={afternoon} onChangeText={setAfternoon} keyboardType="decimal-pad" placeholder="e.g. 30" />
        <Field label="Evening · 6:00 PM–12:00 AM (₹)" value={evening} onChangeText={setEvening} keyboardType="decimal-pad" placeholder="e.g. 40" />
        <Btn kind="g" t="Save delivery charges" onPress={add} />
        <Text style={[s.sub, { marginTop: 8 }]}>NearKart automatically applies the relevant charge based on the buyer's delivery area and the exact time the order is placed. You can add multiple service areas. Saving an existing area updates its three charges.</Text>
      </View>
      <View style={s.card}>
        <Text style={s.h}>Configured delivery areas ({list.length})</Text>
        {list.length === 0 && <Text style={s.sub}>No area-specific charges configured yet. The shop's standard delivery charge will apply until you add an area.</Text>}
        {list.map((x) => (
          <View key={x.id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE }}>
            <View style={s.rowB}>
              <RNText style={[s.shopN,{flex:1}]}>📍 {x.area}</RNText>
              <TouchableOpacity onPress={() => del(x)}><RNText style={{color:RED,fontWeight:'700'}}>Remove</RNText></TouchableOpacity>
            </View>
            <View style={[s.rowB,{marginTop:8}]}><Text style={s.sub}>Morning · 6 AM–12 PM</Text><RNText style={s.price}>{money(Number(x.morning_fee ?? x.fee ?? 0))}</RNText></View>
            <View style={[s.rowB,{marginTop:4}]}><Text style={s.sub}>Afternoon · 12 PM–6 PM</Text><RNText style={s.price}>{money(Number(x.afternoon_fee ?? x.fee ?? 0))}</RNText></View>
            <View style={[s.rowB,{marginTop:4}]}><Text style={s.sub}>Evening · 6 PM–12 AM</Text><RNText style={s.price}>{money(Number(x.evening_fee ?? x.fee ?? 0))}</RNText></View>
          </View>
        ))}
      </View>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}


// ======================================================================
// NEARKART BRAND SPLASH — short premium marketplace reveal
// ======================================================================
function NearKartSplash() {
  const letterValues = useRef("NearKart".split("").map(() => new Animated.Value(0))).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(7)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.stagger(85, letterValues.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true })
      )),
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(taglineY, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#073DBB', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
      <StatusBar barStyle="light-content" backgroundColor="#073DBB" />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {"NearKart".split("").map((letter, index) => (
          <Animated.Text key={index} style={{
            color: index < 4 ? '#FFFFFF' : '#FF9418',
            fontSize: 36, fontWeight: '900', letterSpacing: 0.1,
            opacity: letterValues[index],
            transform: [{ translateY: letterValues[index].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
          }}>{letter === ' ' ? '\u00a0' : letter}</Animated.Text>
        ))}
      </View>
      <Animated.Text style={{ marginTop: 14, color: '#EAF1FF', fontSize: 10, fontWeight: '800',
        letterSpacing: 2.1, opacity: taglineOpacity, transform: [{ translateY: taglineY }],
        textAlign: 'center' }}>
        YOUR NEIGHBOURHOOD, YOUR MARKETPLACE
      </Animated.Text>
      <View style={{ position: 'absolute', bottom: 42, alignItems: 'center' }}>
        <View style={{ width: 42, height: 3, borderRadius: 3, backgroundColor: '#315BB8', overflow: 'hidden' }}>
          <View style={{ width: 22, height: 3, borderRadius: 3, backgroundColor: '#FF9418' }} />
        </View>
      </View>
    </View>
  );
}

// ======================================================================
// ROOT APP
// (no splash screen, no language screen at launch - language is chosen only in Profile)
// ======================================================================
const EMPTY_PROFILE = { name: '', phone: '', address: '' };

export default function App() {
  const [lang, setLangState] = useState('en');
  const [showLang, setShowLang] = useState(false); // opened ONLY from Profile -> Language
  const [session, setSession] = useState(null);
  const [role, setRole] = useState('buyer');
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loc, setLoc] = useState(null);
  const [locOpen, setLocOpen] = useState(false);
  const [shops, setShops] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startupReady, setStartupReady] = useState(false);
  const [splashMinDone, setSplashMinDone] = useState(false);
  const [err, setErr] = useState('');
  const [cart, setCart] = useState(null);
  const [tab, setTab] = useState('home');
  const [page, setPage] = useState(null); // 'notif' | 'khata' | 'support' | 'addr'
  const [shopSel, setShopSel] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [catInit, setCatInit] = useState(null);
  const [done, setDone] = useState(null);
  const [authRole, setAuthRole] = useState(null); // null | 'buyer' | 'seller'
  const [recovery, setRecovery] = useState(null);
  const [myShop, setMyShop] = useState(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopErr, setShopErr] = useState('');
  const profKey = useRef('id');
  const lastUrl = useRef('');

  // ---------- data ----------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const list = unwrapList(await shopRpc('list'));
      setShops(list);
      const p = await api('/rest/v1/products?active=eq.true&select=*&order=created_at.desc&limit=60');
      setProducts(withShopNames(p, list));
      setErr('');
    } catch (e) { setErr(errMsg(e)); }
    setLoading(false);
  }, []);

  const loadMyShop = async () => {
    setShopLoading(true); setShopErr('');
    try {
      let r = await shopRpc('mine');
      if (Array.isArray(r)) r = r[0];
      setMyShop(r && r.id ? r : null);
    } catch (e) { setShopErr(errMsg(e)); setMyShop(null); }
    setShopLoading(false);
  };

  // ---------- session ----------
  const clearUser = () => {
    setSession(null); setRole('buyer'); setMyShop(null); setShopErr('');
    setProfile(EMPTY_PROFILE); setCart(null);
    setPage(null); setShopSel(null); setFocusId(null); setDone(null); setTab('home');
  };
  const logout = () => {
    const tok = SESSION && SESSION.token;
    if (tok) raw('/auth/v1/logout', { method: 'POST' }, tok).catch(() => {});
    SESSION = null; store.del('session');
    clearUser();
    loadData();
  };
  // role always comes from the database row (profiles.role); wantSeller only when the user came from the seller login
  const enterSession = async (sess, wantSeller, persist) => {
    SESSION = sess;
    if (persist) store.set('session', JSON.stringify(sess));
    let row = null;
    try { row = await fetchProfileRow(sess.uid); } catch (e) { row = null; }
    if (!SESSION) return;
    if (row) profKey.current = row.id === sess.uid ? 'id' : (row.user_id === sess.uid ? 'user_id' : 'id');
    setSession(SESSION);
    setProfile({
      name: (row && row.name) || '',
      phone: (row && row.phone) || '',
      address: (row && row.address) || '',
    });
    const seller = (row && row.role === 'seller') || !!wantSeller;
    setRole(seller ? 'seller' : 'buyer');
    if (seller) await loadMyShop();
    registerPushToken().catch(() => {});
  };
  const onSession = async (sess) => {
    await enterSession(sess, authRole === 'seller', true);
    setAuthRole(null);
  };

  // ---------- startup ----------
  useEffect(() => {
    ON_EXPIRED = () => { clearUser(); };
    if (Notif && Notif.setNotificationHandler) {
      try {
        Notif.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
            shouldPlaySound: true, shouldSetBadge: false,
          }),
        });
      } catch (e) { /* notifications are optional */ }
    }
    const boot = async () => {
      // saved language (default English). The language screen is never shown at launch.
      const sl = await store.get('lang');
      if (sl && TR[sl]) { LANG = sl; setLangState(sl); }
      const sloc = await store.get('loc');
      if (sloc) { try { setLoc(JSON.parse(sloc)); } catch (e) { /* ignore broken saved location */ } }
      loadData();
      const ss = await store.get('session');
      if (ss) {
        let sess = null;
        try { sess = JSON.parse(ss); } catch (e) { sess = null; }
        if (sess && sess.token && sess.uid) {
          SESSION = sess;
          try { await enterSession(sess, false, false); } catch (e) { /* session kept, user can retry */ }
        }
      }
    };
    boot().finally(() => setStartupReady(true));
    return () => { ON_EXPIRED = null; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSplashMinDone(true), 2600);
    return () => clearTimeout(t);
  }, []);

  // ---------- password reset deep link ----------
  useEffect(() => {
    if (!ExLink) return undefined;
    const handle = async (url) => {
      if (!url || url.indexOf('reset-password') < 0 || lastUrl.current === url) return;
      lastUrl.current = url;
      try {
        const qp = (ExLink.parse(url).queryParams) || {};
        const hp = {};
        (url.indexOf('#') >= 0 ? url.split('#')[1] : '').split('&').forEach((kv) => {
          const i = kv.indexOf('=');
          if (i > 0) hp[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
        });
        if (qp.error_description || hp.error_description) {
          Alert.alert('Password reset', String(qp.error_description || hp.error_description).replace(/\+/g, ' '));
          return;
        }
        if (hp.access_token) { setRecovery({ access_token: hp.access_token }); return; }
        if (qp.code) {
          const verifier = await loadVerifier();
          if (!verifier) { Alert.alert('Password reset', 'This reset link has expired. Please request a new one.'); return; }
          const j = await raw('/auth/v1/token?grant_type=pkce', {
            method: 'POST', body: { auth_code: String(qp.code), code_verifier: verifier },
          });
          if (!j || !j.access_token) throw new Error('Reset link is invalid. Please request a new one.');
          await clearVerifier();
          setRecovery({ access_token: j.access_token });
        }
      } catch (e) { Alert.alert('Password reset', authErrMsg(e)); }
    };
    ExLink.getInitialURL().then(handle).catch(() => {});
    const sub = ExLink.addEventListener('url', (ev) => handle(ev && ev.url));
    return () => { if (sub && sub.remove) sub.remove(); };
  }, []);

  // ---------- small handlers ----------
  const changeLang = (l) => {
    LANG = l; setLangState(l); store.set('lang', l); setShowLang(false);
  };
  const onLang = (k) => { if (k === 'pick') setShowLang(true); else changeLang(k); };
  const saveLoc = (l) => { setLoc(l); store.set('loc', JSON.stringify(l)); setLocOpen(false); };
  const needLogin = () => setAuthRole('buyer');
  const pick = (k) => { setDone(null); setPage(null); setShopSel(null); setFocusId(null); setTab(k); };
  const openShop = (x) => { setPage(null); setFocusId(null); setShopSel(x); };
  const openProduct = (p) => {
    const sh = shops.find((x) => x.id === p.shop_id);
    if (!sh) return;
    setPage(null); setFocusId(p.id); setShopSel(sh);
  };
  const openCat = (c) => { setCatInit(c); pick('cats'); };

  const addToCart = (shop, p, qty) => {
    const doAdd = (base) => {
      const items = { ...(base ? base.items : {}) };
      items[p.id] = { p, qty };
      setCart({ shop, items });
    };
    if (cart && cart.shop && cart.shop.id !== shop.id && Object.keys(cart.items || {}).length) {
      Alert.alert(trs('Different shop'), trs('Your cart has items from another shop. Clear it?'), [
        { text: trs('No'), style: 'cancel' },
        { text: trs('Yes'), onPress: () => doAdd(null) },
      ]);
      return;
    }
    doAdd(cart);
  };

  const reorder = async (o) => {
    const lines = (o.order_items || []).filter((i) => i.product_id);
    const ids = lines.map((i) => i.product_id).join(',');
    const none = () => Alert.alert(trs('Reorder'), trs('Products not available'));
    if (!ids) { none(); return; }
    try {
      const fresh = (await api('/rest/v1/products?id=in.(' + ids + ')&active=eq.true&select=*')) || [];
      const items = {};
      lines.forEach((i) => {
        const p = fresh.find((x) => x.id === i.product_id);
        if (p && Number(p.online_qty) > 0) items[p.id] = { p, qty: Math.min(Number(i.qty), Number(p.online_qty)) };
      });
      const sid = o.shop_id || (fresh[0] && fresh[0].shop_id);
      const shop = shops.find((x) => x.id === sid);
      if (!Object.keys(items).length || !shop) { none(); return; }
      setCart({ shop, items });
      pick('cart');
    } catch (e) { Alert.alert(trs('Reorder'), errMsg(e)); }
  };

  // saves name / phone / address on the buyer's own profiles row (role is never sent)
  const saveProfile = async (d) => {
    const clean = { name: (d.name || '').trim(), phone: (d.phone || '').trim(), address: (d.address || '').trim() };
    setProfile(clean);
    if (!SESSION) return '';
    try {
      const upd = await api('/rest/v1/profiles?' + profKey.current + '=eq.' + SESSION.uid, {
        method: 'PATCH', prefer: 'return=representation', body: clean,
      });
      if (Array.isArray(upd) && upd.length === 0) {
        await api('/rest/v1/profiles?on_conflict=id', {
          method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: { id: SESSION.uid, ...clean },
        });
      }
      return '';
    } catch (e) { return errMsg(e); }
  };
  const syncProfile = () => { if (SESSION && role === 'buyer') saveProfile(profile); };
  const onOrderDone = (d) => { setCart(null); setDone(d); loadData(); };

  // ======================================================================
  // RENDER
  // ======================================================================

  // language screen: only when the user taps Language inside Profile (or seller More)
  if (!startupReady || !splashMinDone) return <NearKartSplash />;

  if (showLang) {
    return (
      <LangScreen current={lang} onPick={changeLang} onClose={() => setShowLang(false)} />
    );
  }

  if (recovery) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="dark-content" />
        <ResetPassword recovery={recovery} onDone={() => { setRecovery(null); setAuthRole('buyer'); }} />
      </SafeAreaView>
    );
  }

  if (authRole) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <AuthScreen role={authRole} onSession={onSession} onClose={() => setAuthRole(null)} />
      </SafeAreaView>
    );
  }

  // ---------- seller (Partner Hub) ----------
  if (session && role === 'seller') {
    let sbody;
    if (shopLoading) {
      sbody = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={BLUE} /></View>;
    } else if (myShop) {
      sbody = <SellerApp shop={myShop} setShop={setMyShop} lang={lang} onLang={onLang} onLogout={logout} />;
    } else {
      sbody = <SellerSetupScreen defaultArea={loc && loc.area ? loc.area : ''} onCreated={(sh) => setMyShop(sh)}
        onLogout={logout} loadErr={shopErr} />;
    }
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <View style={{ flex: 1, backgroundColor: BG }}>{sbody}</View>
      </SafeAreaView>
    );
  }

  // ---------- buyer ----------
  const cartCount = cart && cart.items ? Object.keys(cart.items).length : 0;
  const offerCount = shops.filter(isOfferLive).length;
  let body = null;
  if (done) {
    body = <Success done={done} onTrack={() => { setDone(null); setTab('orders'); }}
      onHome={() => { setDone(null); setTab('home'); }} />;
  } else if (page === 'notif') {
    body = <BuyerNotifications session={session} shops={shops} products={products} needLogin={needLogin}
      onShop={openShop} onProduct={openProduct} onOrders={() => pick('orders')} onBack={() => setPage(null)} />;
  } else if (page === 'khata') {
    body = <BuyerKhata session={session} onBack={() => setPage(null)} />;
  } else if (page === 'support') {
    body = <SupportPage onBack={() => setPage(null)} />;
  } else if (page === 'privacy') {
    body = <PrivacyPolicyPage onBack={() => setPage(null)} />;
  } else if (page === 'addr') {
    body = <AddressPage profile={profile} onSave={saveProfile} loc={loc} onLoc={() => setLocOpen(true)}
      onBack={() => setPage(null)} />;
  } else if (shopSel) {
    body = <ShopScreen key={shopSel.id + ':' + (focusId || '')} shop={shopSel} focusId={focusId} cart={cart}
      profile={profile} onAdd={addToCart}
      onBack={() => { setShopSel(null); setFocusId(null); }}
      onCart={() => { setShopSel(null); setFocusId(null); setTab('cart'); }} />;
  } else if (tab === 'home') {
    body = <Home shops={shops} products={products} loading={loading} err={err} loc={loc}
      onLoc={() => setLocOpen(true)} onShop={openShop} onProduct={openProduct} onReload={loadData}
      onMenu={() => pick('profile')} onBell={() => setPage('notif')} onProfile={() => pick('profile')}
      onCats={() => pick('cats')} onCat={openCat} bellCount={offerCount} />;
  } else if (tab === 'cats') {
    body = <Categories shops={shops} onShop={openShop} initial={catInit} clearInitial={() => setCatInit(null)} />;
  } else if (tab === 'cart') {
    body = <CartScreen cart={cart} setCart={setCart} session={session} needLogin={needLogin} onDone={onOrderDone}
      profile={profile} setProfile={setProfile} syncProfile={syncProfile} />;
  } else if (tab === 'orders') {
    body = <BuyerOrders session={session} needLogin={needLogin} onReorder={reorder} />;
  } else {
    body = <Profile session={session} needLogin={needLogin} onPartner={() => setAuthRole('seller')}
      onLogout={logout} onOrders={() => pick('orders')} lang={lang} onLang={onLang} profile={profile}
      loc={loc} onLoc={() => setLocOpen(true)} onAddr={() => setPage('addr')}
      onSupport={() => setPage('support')} onNotif={() => setPage('notif')} onKhata={() => setPage('khata')}
      onPrivacy={() => setPage('privacy')} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: BG }}>{body}</View>
      {!done && (
        <TabBar cur={tab} onPick={pick} tabs={[
          ['home', '🏠', 'Home'],
          ['cats', '🗂️', 'Categories'],
          ['cart', '🛒', 'Cart', cartCount > 0 ? cartCount : null],
          ['orders', '📦', 'Orders'],
          ['profile', '👤', 'Profile'],
        ]} />
      )}
      {locOpen && <LocSheet loc={loc} onClose={() => setLocOpen(false)} onSave={saveLoc} />}
    </SafeAreaView>
  );
}

// ======================================================================
// STYLES
// ======================================================================
const s = StyleSheet.create({
  btn: { backgroundColor: BLUE, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnS: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, borderRadius: 12 },
  btnO: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: BLUE },
  btnR: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: RED },
  btnT: { color: '#fff', fontWeight: '800', fontSize: 15 },
  label: { fontSize: 12, color: MUTE, fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 15, color: INK, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1,
    borderColor: LINE, marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: BLUE, borderColor: BLUE },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 12, fontWeight: '700',
    overflow: 'hidden', alignSelf: 'flex-start' },
  tagS: { fontSize: 10, paddingHorizontal: 6, paddingVertical: 2 },
  msg: { padding: 12, borderRadius: 12, marginVertical: 6 },
  head: { backgroundColor: BLUE, paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 12) + 8,
    paddingHorizontal: 16, paddingBottom: 16 },
  headT: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 8 },
  rowB: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 14,
    marginHorizontal: 14, marginTop: 12 },
  h: { fontSize: 17, fontWeight: '800', color: INK, marginBottom: 8 },
  sub: { fontSize: 12.5, color: MUTE },
  shopN: { fontSize: 16, fontWeight: '800', color: INK },
  link: { color: BLUE, fontWeight: '700' },
  empty: { textAlign: 'center', color: MUTE, padding: 24, fontSize: 15 },
  price: { fontWeight: '800', color: INK, fontSize: 15 },
  offer: { color: ORANGE, fontWeight: '700', marginTop: 4, fontSize: 12 },
  shopCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 18,
    borderWidth: 1, borderColor: LINE, padding: 12, marginBottom: 10 },
  mini: { width: '48.5%', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE,
    padding: 10, marginBottom: 10 },
  miniN: { fontSize: 14, fontWeight: '800', color: INK },
  arrow: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#e8f0ff', alignItems: 'center',
    justifyContent: 'center' },
  pcard: { width: '48.5%', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: LINE,
    padding: 10, marginBottom: 10 },
  tile: { width: '23%', paddingVertical: 12, borderRadius: 16, alignItems: 'center', marginBottom: 10 },
  tileT: { fontSize: 11, fontWeight: '700', color: INK, marginTop: 4 },
  banner: { marginHorizontal: 14, marginTop: 12, backgroundColor: '#e3f4e8', flexDirection: 'row',
    alignItems: 'center', borderRadius: 20, padding: 18 },
  hello: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    paddingHorizontal: 12, marginTop: 14, gap: 8, height: 48 },
  searchIn: { flex: 1, fontSize: 14, color: INK, paddingVertical: 8 },
  avatarS: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -6, right: -8, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: RED, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeT: { color: '#fff', fontSize: 10, fontWeight: '800' },
  mic: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mrow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  mrowLine: { borderBottomWidth: 1, borderBottomColor: LINE },
  tileCard: { width: '48.5%', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, padding: 14,
    marginBottom: 10 },
  camBadge: { position: 'absolute', right: -4, bottom: -4, width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(10,20,50,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18,
    paddingBottom: 28, maxHeight: '90%' },
  grab: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#cfd6e4', alignSelf: 'center',
    marginBottom: 12 },
  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: BG, borderRadius: 14, padding: 12, marginVertical: 12 },
  prow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  cartBar: { position: 'absolute', left: 14, right: 14, bottom: 12, backgroundColor: GREEN, borderRadius: 16,
    padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cartBarT: { color: '#fff', fontWeight: '800' },
  okOuter: { width: 110, height: 110, borderRadius: 55, backgroundColor: '#c9f0d8', alignItems: 'center',
    justifyContent: 'center' },
  okInner: { width: 80, height: 80, borderRadius: 40, backgroundColor: GREEN, alignItems: 'center',
    justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cfd6e4', backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center' },
  sdot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#cfd6e4',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  abtn: { width: '48.5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 14, borderWidth: 1.5, marginBottom: 10 },
  adBox: { backgroundColor: BLUE, borderRadius: 14, padding: 14, marginVertical: 10 },
  billRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1,
    borderTopColor: LINE },
  thead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: LINE },
  th: { fontSize: 11, fontWeight: '800', color: MUTE },
  trow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 1,
    borderBottomColor: LINE },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  sec: { marginHorizontal: 14, marginTop: 14, marginBottom: 6 },
  alertBar: { backgroundColor: ORANGE, padding: 12, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center' },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: LINE,
    paddingTop: 6, paddingBottom: 10 },
  tab: { flex: 1, alignItems: 'center' },
  tabT: { fontSize: 10, color: MUTE, marginTop: 2 },
});
