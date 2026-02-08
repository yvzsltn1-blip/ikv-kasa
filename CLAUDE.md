# IKV Kasa Yonetim Sistemi - Proje Rehberi

## Proje Ozeti
Firebase (Auth + Firestore) tabanli RPG envanter yonetim sistemi. React 19 + TypeScript + Tailwind CSS v4 + Vite 6 ile gelistirilmis. Turkce arayuz.

## Mimari
- **Routing yok** - Tek sayfa uygulama, view switching ile calisir
- **State yonetimi** - React useState/useEffect, global store yok
- **Veri akisi**: Hesap -> Sunucu (6) -> Karakter (4) -> Kasa1/Kasa2/Canta -> Slot'lar (item'lar)
- **Kayit**: Manuel (Kaydet butonu ile Firestore'a setDoc)

## Dosya Yapisi
```
App.tsx              -> Ana bilesen (~1350 satir). Tum state, CRUD, auth, UI, global set hesaplama, tilsim duplikasyon tespiti
types.ts             -> TypeScript arayuzleri (ItemData, SlotData, Container, Character, Server, Account, SetItemLocation, GlobalSetInfo)
constants.ts         -> Sabitler, renk map'leri, createCharacter/createServer/createAccount fonksiyonlari
firebase.ts          -> Firebase config ve export (auth, db)
firestore.rules      -> Guvenlik kurallari (users/{uid}, usernames/{username}, globalItems/{itemId}, metadata/enchantments)
index.tsx            -> React root renderer
src/index.css        -> Tailwind import + custom scrollbar stilleri + tilsim glow animasyonu

components/
  LoginScreen.tsx    -> Email/sifre + Google OAuth giris/kayit (email dogrulama zorunlu)
  ContainerGrid.tsx  -> Surukle-birak grid (desktop drag&drop, mobil long-press + 15px drag threshold, tilsim glow prop gecisi)
  ItemModal.tsx      -> Esya/recete ekleme-duzenleme (3 adimli form, mobil-kompakt layout, renkli cinsiyet/sinif butonlari)
  ItemDetailModal.tsx -> Esya detay popup (tilsim duplikasyon konum bilgisi dahil)
  SlotItem.tsx       -> Tek slot gorunumu (ikon, seviye, cinsiyet, sinif rozeti, tilsim glow efekti)
  GlobalSearchModal.tsx -> Tum hesap/sunucu/karakter uzerinde gelismis arama + filtre + global arama (diger kullanicilar)
  RecipeBookModal.tsx   -> Ogrenilmis recete kitabi
  SetDetailModal.tsx    -> Set detay popup (2x4 grid, kategori bazli konum + seviye bilgisi, recete/okunmus badge'leri)
```

## Firestore Veri Yapisi
```
users/{uid}
  username: string (1 kerelik, opsiyonel)
  socialLink: string (sosyal medya profil linki)
  permissions: {
    canDataEntry: boolean (admin kapatirsa kullanici salt-okunur moda duser)
    canGlobalSearch: boolean (admin kapatirsa global arama sekmesi devre disi)
  }
  searchQuota: {
    global: { day: string, used: number, updatedAt: number }
  }
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
  names: string[] (tum kullanicilarin girdigi efsun isimleri, arrayUnion ile eklenir)
```

## Onemli Kavramlar

### Temel Yapilar
- **Sunucular**: Eminonu, Galata, Bab-i Ali, Beyaz Kosk, Meran, Karakoy (her hesapta 6 sunucu)
- **Grid boyutlari**: Kasa1/Kasa2 = 8x8 (64 slot), Canta = 6x4 (24 slot)
- **View sirasi**: bank1 -> bank2 -> bag (SONRAKI butonu ile dongusal)
- **Kategori renkleri**: constants.ts -> CATEGORY_COLORS
- **Sinif renkleri**: constants.ts -> CLASS_COLORS, CLASS_STRIP_COLORS
- **Sinif sirasi**: constants.ts -> HERO_CLASSES = ['Savasci', 'Buyucu', 'Sifaci', 'Tum Siniflar']
- **Admin email**: yvzsltn61@gmail.com (hardcoded kontrol)
- **Migration**: Eski format (account.characters) -> yeni format (account.servers) otomatik migration var (App.tsx migrateAccount)

### Cinsiyet & Sinif Kurallari (ItemModal.tsx)
- **Silah**: Sabit "Tum Cinsiyetler" (secim yok) + Savasci, Buyucu, Sifaci
- **Gozluk**: Erkek/Kadin secimi var + sabit "Tum Siniflar" (sinif secimi yok)
- **Ceket, Pantolon, Eldiven, Ayakkabi, Zirh**: Sadece Erkek, Kadin (Tum Cinsiyetler YOK) + Savasci, Buyucu, Sifaci
- **Yuzuk, Kolye, Iksir, Maden, Diger**: Sabit "Tum Cinsiyetler" (secim yok) + Sabit "Tum Siniflar" (secim yok)
- **Tilsim**: Sabit "Tum Cinsiyetler" + Savasci, Buyucu, Sifaci (sinif secimi var)
- **Recete kategori kisiti**: Recete olustururken Gozluk, Yuzuk, Kolye secenekleri gizlenir
- **Renkli butonlar**: Erkek=mavi, Kadin=pembe, Tum Cins.=indigo | Savasci=mavi, Buyucu=kirmizi, Sifaci=yesil
- `isGenderless` = ['Silah', 'Yuzuk', 'Kolye', 'Tilsim', 'Iksir', 'Maden', 'Diger'] -> cinsiyet alani gorunur ama sabit "Tum Cinsiyetler"
- `isClassless` = ['Gozluk', 'Yuzuk', 'Kolye', 'Iksir', 'Maden', 'Diger'] -> sinif alani gorunur ama sabit "Tum Siniflar"
- Kategori degistirirken: genderless'tan gendered'a geciste "Tum Cinsiyetler" -> "Erkek", classless'tan classed'a geciste "Tum Siniflar" -> "Savasci"

### Tilsim Duplikasyon Uyarisi
- **Mantik**: Ayni karakterin bank1+bank2+bag icinde ayni `enchantment1|enchantment2|heroClass` key'ine sahip 3+ tilsim varsa yanip sonen glow efekti
- **Kademe filtresi**: Sadece I ve II kademe tilsimlar icin gecerli. III kademe (enchantment2 === 'III') hariç tutulur
- **Tilsim kademe degerleri**: 'I', 'II', 'III' (Roma rakamlari olarak saklanir, sayi degil!)
- **Renk**: enchantment1'in hash'ine gore 10 renkten biri secilir (ayni isim her zaman ayni renk). Palet: cyan, red, lime, violet, amber, pink, sky, emerald, rose, orange
- **Akis**: App.tsx `talismanDuplicates` useMemo -> ContainerGrid'e prop -> SlotItem'a `talismanGlowColor` prop -> CSS `talisman-glow` sinifi + `--glow-color` custom property
- **Animasyon**: src/index.css'te `@keyframes talisman-pulse` (1.8s box-shadow pulse)
- **Detay penceresi**: ItemDetailModal'da tilsim duplikasyonlari varsa konum bilgisi gosterilir: "K1 3X8 - K2 4X1 - C 3X3" formati (K1=Kasa1, K2=Kasa2, C=Canta, satirXsutun)
- **talismanLocations**: App.tsx'te ayri useMemo, detailItem acildiginda hesaplanir, ItemDetailModal'a prop olarak gecilir

### Global Ozellikler
- **Global gorunurluk**: ItemData.isGlobal alani, esya eklerken "Globalde Goster" / "Sadece Kendim" toggle, globalItems Firestore koleksiyonu
- **Global arama**: GlobalSearchModal'da "Hesaplarim" / "Globalde Ara" sekmeleri, diger kullanicilarin paylastigi esyalari gorme
- **Kullanici yetki kontrolu**: Admin panelinden kullanici bazli `canDataEntry` ve `canGlobalSearch` ac/kapat. Veri girisi kapaliysa uygulama salt-okunur; global arama kapaliysa global sekme kilitli
- **Sosyal medya linki**: Kullanicilar profil linki (Facebook/Instagram/Twitter) kaydedebilir, global aramada diger kullanicilara gosterilir
- **Arama detaylari**: Sonuclarda silah cinsi (weaponType) ve maden/iksir adedi gosterilir, weaponType ile aranabilir
- **Kelime bazli arama**: Arama metni boslukla ayrilir, her kelime ayri ayri aranir (AND mantigi). Orn: "Alman Dis" -> enchantment1'de "alman", enchantment2'de "dis" bulunur -> eslesir
- **Global arama optimizasyonu**: Sorgu bazli fetch (kategori filtresine gore `where`), `limit(20)`, 5 dakika client-side cache, Firebase ucretsiz kota icinde kalir
- **Global set takip**: Tum hesaplar/sunucular/karakterler genelinde set tamamlanma durumu. App.tsx'te `globalSetLookup` (Map) ve `globalSetMap` (Map) useMemo ile hesaplanir. Key format: `ench1|ench2|gender|heroClass`. Set rozeti tiklaninca SetDetailModal acilir
- **Global efsun onerileri**: `metadata/enchantments` Firestore dokumaninda tum kullanicilarin girdigi efsun isimleri saklanir (arrayUnion). Login'de fetch edilir, `enchantmentSuggestions`'a merge edilir. ItemModal'da 2+ harf yazinca oneriler gorunur. handleSaveItem'da yeni efsunlar otomatik eklenir

### Mobil Davranislar
- **Surukle-birak / detay ayrimi**: ContainerGrid.tsx'te 400ms long-press sonrasi 15px `DRAG_THRESHOLD` ile ayrim yapilir. Esik asilmazsa detay penceresi acilir, asilirsa surukleme modu baslar
- **ItemModal mobil-kompakt**: step 3 formunda mobilde `space-y-2`, `p-3`, cinsiyet+sinif yan yana, label'lar `text-[10px]`, buton padding'ler kucultulmus. Desktop'ta `md:` prefix'leri ile normal boyut korunur
- **Tur/Sinif ozeti**: Step 3'te "Tur: Item | Sinif: Yuzuk" yan yana, `text-[10px]`, ortali

## Deployment
- `npx vite build` -> dist/ klasorune build
- `npx firebase deploy --only hosting` -> Firebase Hosting'e deploy
- `npx firebase deploy --only firestore:rules` -> Guvenlik kurallarini deploy (metadata/enchantments kurali dahil)
- Batch scriptler: `firebase-guncelle.bat`, `github-guncelle.bat`

## Son Guncelleme
- **Tarih**: 2026-02-08
- **Versiyon**: v4.8
- **Son yapilanlar**:
  - Hesap seciminde sira degistirme eklendi (`handleMoveAccount`), desktop ve mobil UI'ya tasindi
  - Silah kategorisinde cinsiyet secimi kaldirildi; sadece "Tum Cinsiyetler" kaldi
  - Gozluk kategorisinde sinif secimi kaldirildi; sadece "Tum Siniflar" kaldi
  - Recete olusturmada kategori listesinden Gozluk / Yuzuk / Kolye kaldirildi
  - ItemModal submit asamasinda `gender` ve `heroClass` kategoriye gore normalize edilmeye baslandi
  - Excel import kurallari yeni cinsiyet/sinif mantigina gore guncellendi (`genderlessCategories`, `classlessCategories`)
  - Silah Cinsi alanina efsun benzeri otomatik oneriler eklendi (`weaponTypeSuggestions`)
  - Mobil ust bar hesap aksiyonlari (`Yukari/Asagi/Ekle/Sil`) tek bir `...` menusu altina tasindi
  - Mobil ust bar buton/ikon hizalari ve boyutlari optik olarak duzenlendi
  - Desktop'ta hesap aksiyonlari tekrar yanyana butonlara alindi; admin butonu tekrar gorunur hale getirildi

> **NOT**: Buyuk degisiklikler yapildiginda oturum sonunda "CLAUDE.md'yi guncelle" deyin.

## Sik Degistirilen Yerler
- **UI duzenlemeleri**: App.tsx (header bolumu ~satir 660-910)
- **Item yonetimi**: App.tsx (handleMoveItem, updateSlot, handleSaveItem, handleReadRecipe, syncGlobalItem)
- **Tilsim duplikasyon**: App.tsx (talismanDuplicates/talismanLocations useMemo, getTalismanColor, TALISMAN_GLOW_COLORS), ContainerGrid.tsx (talismanKey hesaplama), SlotItem.tsx (talisman-glow class), ItemDetailModal.tsx (konum gosterimi), src/index.css (talisman-pulse animasyonu)
- **Cinsiyet/sinif kurallari**: ItemModal.tsx (isGenderless, isClassless, GENDER_OPTIONS filter, HERO_CLASSES filter, kategori degisim handler)
- **Set takip**: App.tsx (globalSetLookup/globalSetMap useMemo), components/SetDetailModal.tsx (recete badge, okunmus/okunmamis durumu)
- **Mobil touch davranisi**: components/ContainerGrid.tsx (DRAG_THRESHOLD, touchInfo ref, handleTouchStart/End/Move)
- **Efsun onerileri**: App.tsx (enchantmentSuggestions useMemo, globalEnchantments state, handleSaveItem icinde arrayUnion)
- **Arama**: components/GlobalSearchModal.tsx
- **Yeni ozellik tipi**: types.ts -> interface guncelle, constants.ts -> create fonksiyonlarini guncelle
- **Mobil responsive**: Tailwind class'lari, `md:` prefix desktop, base mobile-first
