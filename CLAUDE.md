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
firestore.rules      → Güvenlik kuralları (users/{uid}, usernames/{username}, globalItems/{itemId})
index.tsx            → React root renderer
src/index.css        → Tailwind import + custom scrollbar stilleri

components/
  LoginScreen.tsx    → Email/şifre + Google OAuth giriş/kayıt (email doğrulama zorunlu)
  ContainerGrid.tsx  → Sürükle-bırak grid (desktop drag&drop, mobil long-press)
  ItemModal.tsx      → Eşya/reçete ekleme-düzenleme (3 adımlı form, global görünürlük toggle)
  SlotItem.tsx       → Tek slot görünümü (ikon, seviye, cinsiyet, sınıf rozeti)
  GlobalSearchModal.tsx → Tüm hesap/sunucu/karakter üzerinde gelişmiş arama + filtre + global arama (diğer kullanıcılar)
  RecipeBookModal.tsx   → Öğrenilmiş reçete kitabı
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

## Deployment
- `npx vite build` → dist/ klasörüne build
- `npx firebase deploy --only hosting` → Firebase Hosting'e deploy
- `npx firebase deploy --only firestore:rules` → Güvenlik kurallarını deploy
- Batch scriptler: `firebase-guncelle.bat`, `github-guncelle.bat`

## Son Güncelleme
- **Tarih**: 2026-02-06
- **Versiyon**: v4.3
- **Son yapılanlar**: Kelime bazlı AND arama (çoklu efsun araması düzeltmesi), global arama limiti 50→20, sorgu bazlı fetch optimizasyonu (limit+where+cache)

> **NOT**: Büyük değişiklikler yapıldığında oturum sonunda "CLAUDE.md'yi güncelle" deyin.

## Sık Değiştirilen Yerler
- **UI düzenlemeleri**: App.tsx (header bölümü ~satır 630-880)
- **Item yönetimi**: App.tsx (handleMoveItem, updateSlot, handleSaveItem, handleReadRecipe, syncGlobalItem)
- **Arama**: components/GlobalSearchModal.tsx
- **Yeni özellik tipi**: types.ts → interface güncelle, constants.ts → create fonksiyonlarını güncelle
- **Mobil responsive**: Tailwind class'ları, `md:` prefix desktop, base mobile-first
