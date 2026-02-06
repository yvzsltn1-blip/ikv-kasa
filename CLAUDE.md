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
App.tsx              → Ana bileşen (~1150 satır). Tüm state, CRUD, auth, UI
types.ts             → TypeScript arayüzleri (ItemData, SlotData, Container, Character, Server, Account)
constants.ts         → Sabitler, renk map'leri, createCharacter/createServer/createAccount fonksiyonları
firebase.ts          → Firebase config ve export (auth, db)
firestore.rules      → Güvenlik kuralları (users/{uid}, usernames/{username})
index.tsx            → React root renderer
src/index.css        → Tailwind import + custom scrollbar stilleri

components/
  LoginScreen.tsx    → Email/şifre + Google OAuth giriş/kayıt (email doğrulama zorunlu)
  ContainerGrid.tsx  → Sürükle-bırak grid (desktop drag&drop, mobil long-press)
  ItemModal.tsx      → Eşya/reçete ekleme-düzenleme (3 adımlı form)
  SlotItem.tsx       → Tek slot görünümü (ikon, seviye, cinsiyet, sınıf rozeti)
  GlobalSearchModal.tsx → Tüm hesap/sunucu/karakter üzerinde gelişmiş arama + filtre
  RecipeBookModal.tsx   → Öğrenilmiş reçete kitabı
```

## Firestore Veri Yapısı
```
users/{uid}
  username: string (1 kerelik, opsiyonel)
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
```

## Önemli Kavramlar
- **Sunucular**: Eminönü, Galata, Bab-ı Ali, Beyaz Köşk, Meran, Karaköy (her hesapta 6 sunucu)
- **Grid boyutları**: Kasa1/Kasa2 = 8x8 (64 slot), Çanta = 6x4 (24 slot)
- **View sırası**: bank1 → bank2 → bag (SONRAKİ butonu ile döngüsel)
- **Kategori renkleri**: constants.ts → CATEGORY_COLORS
- **Sınıf renkleri**: constants.ts → CLASS_COLORS, CLASS_STRIP_COLORS
- **Admin email**: yvzsltn61@gmail.com (hardcoded kontrol)
- **Migration**: Eski format (account.characters) → yeni format (account.servers) otomatik migration var (App.tsx migrateAccount)

## Deployment
- `npx vite build` → dist/ klasörüne build
- `npx firebase deploy --only hosting` → Firebase Hosting'e deploy
- `npx firebase deploy --only firestore:rules` → Güvenlik kurallarını deploy
- Batch scriptler: `firebase-guncelle.bat`, `github-guncelle.bat`

## Son Güncelleme
- **Tarih**: 2026-02-06
- **Versiyon**: v4.0
- **Son yapılanlar**: Sunucu sistemi (6 sunucu/hesap), kullanıcı adı özelliği (1 kerelik, unique), mobil logout butonu düzeltmesi, eski veri formatı migration

> **NOT**: Büyük değişiklikler yapıldığında oturum sonunda "CLAUDE.md'yi güncelle" deyin.

## Sık Değiştirilen Yerler
- **UI düzenlemeleri**: App.tsx (header bölümü ~satır 630-880)
- **Item yönetimi**: App.tsx (handleMoveItem, updateSlot, handleSaveItem, handleReadRecipe)
- **Arama**: components/GlobalSearchModal.tsx
- **Yeni özellik tipi**: types.ts → interface güncelle, constants.ts → create fonksiyonlarını güncelle
- **Mobil responsive**: Tailwind class'ları, `md:` prefix desktop, base mobile-first
