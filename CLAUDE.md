# IKV Kasa Yönetim Sistemi - Proje Rehberi

## Proje Özeti
Firebase (Auth + Firestore) tabanlı RPG envanter yönetim sistemi. React 19 + TypeScript + Tailwind CSS v4 + Vite 6 ile geliştirilmiş. Türkçe arayüz.

## Mimari
- **Routing yok** - Tek sayfa uygulama, view switching ile çalışır
- **State yönetimi** - React useState/useEffect, global store yok
- **Veri akışı**: Hesap → Sunucu (6) → Karakter (4) → Kasa1/Kasa2/Çanta → Slot'lar (item'lar)
- **Kayıt**: Manuel (Kaydet butonu ile Firestore'a setDoc)

## Dosya Yapısı
```
App.tsx              → Ana bileşen (~1250 satır). Tüm state, CRUD, auth, UI, global set hesaplama
types.ts             → TypeScript arayüzleri (ItemData, SlotData, Container, Character, Server, Account, SetItemLocation, GlobalSetInfo)
constants.ts         → Sabitler, renk map'leri, createCharacter/createServer/createAccount fonksiyonları
firebase.ts          → Firebase config ve export (auth, db)
firestore.rules      → Güvenlik kuralları (users/{uid}, usernames/{username}, globalItems/{itemId}, metadata/enchantments)
index.tsx            → React root renderer
src/index.css        → Tailwind import + custom scrollbar stilleri

components/
  LoginScreen.tsx    → Email/şifre + Google OAuth giriş/kayıt (email doğrulama zorunlu)
  ContainerGrid.tsx  → Sürükle-bırak grid (desktop drag&drop, mobil long-press + 15px drag threshold)
  ItemModal.tsx      → Eşya/reçete ekleme-düzenleme (3 adımlı form, global görünürlük toggle, set durumu barı)
  SlotItem.tsx       → Tek slot görünümü (ikon, seviye, cinsiyet, sınıf rozeti)
  GlobalSearchModal.tsx → Tüm hesap/sunucu/karakter üzerinde gelişmiş arama + filtre + global arama (diğer kullanıcılar)
  RecipeBookModal.tsx   → Öğrenilmiş reçete kitabı
  SetDetailModal.tsx    → Set detay popup (2x4 grid, kategori bazlı konum + seviye bilgisi, reçete/okunmuş badge'leri)
```

## Firestore Veri Yapısı
```
users/{uid}
  username: string (1 kerelik, opsiyonel)
  socialLink: string (sosyal medya profil linki)
  accounts: [
    {
      id, name,
      servers: [
        { id, name, characters: [
          { id, name, bank1: Container, bank2: Container, bag: Container, learnedRecipes: ItemData[] }
        ]}
      ]
    }
  ]

usernames/{lowercase_username}
  uid: string, displayName: string

globalItems/{item.id}
  uid: string
  username: string
  accountName: string
  serverName: string
  charName: string
  containerName: string
  item: ItemData
  socialLink: string
  updatedAt: number

metadata/enchantments
  names: string[] (tüm kullanıcıların girdiği efsun isimleri, arrayUnion ile eklenir)
```

## Önemli Kavramlar
- **Sunucular**: Eminönü, Galata, Bab-ı Ali, Beyaz Köşk, Meran, Karaköy (her hesapta 6 sunucu)
- **Grid boyutları**: Kasa1/Kasa2 = 8x8 (64 slot), Çanta = 6x4 (24 slot)
- **View sırası**: bank1 → bank2 → bag (SONRAKİ butonu ile döngüsel)
- **Kategori renkleri**: constants.ts → CATEGORY_COLORS
- **Sınıf renkleri**: constants.ts → CLASS_COLORS, CLASS_STRIP_COLORS
- **Admin email**: yvzsltn61@gmail.com (hardcoded kontrol)
- **Migration**: Eski format (account.characters) → yeni format (account.servers) otomatik migration var (App.tsx migrateAccount)
- **Global görünürlük**: ItemData.isGlobal alanı, eşya eklerken "Globalde Göster" / "Sadece Kendim" toggle, globalItems Firestore koleksiyonu
- **Global arama**: GlobalSearchModal'da "Hesaplarım" / "Globalde Ara" sekmeleri, diğer kullanıcıların paylaştığı eşyaları görme
- **Sosyal medya linki**: Kullanıcılar profil linki (Facebook/Instagram/Twitter) kaydedebilir, global aramada diğer kullanıcılara gösterilir
- **Arama detayları**: Sonuçlarda silah cinsi (weaponType) ve maden/iksir adedi gösterilir, weaponType ile aranabilir
- **Kelime bazlı arama**: Arama metni boşlukla ayrılır, her kelime ayrı ayrı aranır (AND mantığı). Örn: "Alman Dış" → enchantment1'de "alman", enchantment2'de "dış" bulunur → eşleşir
- **Global arama optimizasyonu**: Sorgu bazlı fetch (kategori filtresine göre `where`), `limit(20)`, 5 dakika client-side cache, Firebase ücretsiz kota içinde kalır
- **Global set takip**: Tüm hesaplar/sunucular/karakterler genelinde set tamamlanma durumu. App.tsx'te `globalSetLookup` (Map) ve `globalSetMap` (Map) useMemo ile hesaplanır. Key format: `ench1|ench2|gender|heroClass`. GlobalSearchModal ve ItemModal'a prop olarak geçilir. Set rozeti tıklanınca SetDetailModal açılır (2x4 kompakt grid, kategori renkleri, seviye + konum bilgisi). Reçete item'ları "Reçete" badge'i + "Okunmuş"/"Okunmamış" durumu ile vurgulanır
- **Mobil sürükle-bırak / detay ayrımı**: ContainerGrid.tsx'te 400ms long-press sonrası 15px `DRAG_THRESHOLD` ile ayrım yapılır. Eşik aşılmazsa detay penceresi açılır, aşılırsa sürükleme modu başlar (gölge item ancak eşik aşılınca görünür)
- **Global efsun önerileri**: `metadata/enchantments` Firestore dokümanında tüm kullanıcıların girdiği efsun isimleri saklanır (arrayUnion). Login'de fetch edilir, `enchantmentSuggestions`'a merge edilir. ItemModal'da 2+ harf yazınca öneriler görünür. handleSaveItem'da yeni efsunlar otomatik eklenir

## Deployment
- `npx vite build` → dist/ klasörüne build
- `npx firebase deploy --only hosting` → Firebase Hosting'e deploy
- `npx firebase deploy --only firestore:rules` → Güvenlik kurallarını deploy (metadata/enchantments kuralı dahil)
- Batch scriptler: `firebase-guncelle.bat`, `github-guncelle.bat`

## Son Güncelleme
- **Tarih**: 2026-02-07
- **Versiyon**: v4.5
- **Son yapılanlar**: Mobil sürükle-bırak / detay penceresi ayrımı iyileştirildi (15px drag threshold), SetDetailModal'da reçete badge'i ve okunmuş/okunmamış durumu eklendi

> **NOT**: Büyük değişiklikler yapıldığında oturum sonunda "CLAUDE.md'yi güncelle" deyin.

## Sık Değiştirilen Yerler
- **UI düzenlemeleri**: App.tsx (header bölümü ~satır 630-880)
- **Item yönetimi**: App.tsx (handleMoveItem, updateSlot, handleSaveItem, handleReadRecipe, syncGlobalItem)
- **Set takip**: App.tsx (globalSetLookup/globalSetMap useMemo), components/SetDetailModal.tsx (reçete badge, okunmuş/okunmamış durumu)
- **Mobil touch davranışı**: components/ContainerGrid.tsx (DRAG_THRESHOLD, touchInfo ref, handleTouchStart/End/Move)
- **Efsun önerileri**: App.tsx (enchantmentSuggestions useMemo, globalEnchantments state, handleSaveItem içinde arrayUnion)
- **Arama**: components/GlobalSearchModal.tsx
- **Yeni özellik tipi**: types.ts → interface güncelle, constants.ts → create fonksiyonlarını güncelle
- **Mobil responsive**: Tailwind class'ları, `md:` prefix desktop, base mobile-first
