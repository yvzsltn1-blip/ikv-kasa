@echo off
title IKV Kasa - Cift Yonlu Yayina Alma Araci
color 0B

echo.
echo -----------------------------------------
echo AYARLAR YAPILANDIRILIYOR...
echo Hem eski hem yeni site hedefe ekleniyor.
echo -----------------------------------------
:: Bu komut "kasa-app" hedefini hem eski hem yeni siteye baglar
call firebase target:apply hosting:kasa-app ikvkasa ikv-kasa-yonetimi

echo.
echo -----------------------------------------
echo 1. ADIM: PROJE DERLENIYOR (BUILD)...
echo Lutfen bekleyin, kodlar hazirlaniyor.
echo -----------------------------------------
call npm run build

:: Eğer build işleminde hata varsa işlemi durdur ve beklet (kapanmasın)
IF %ERRORLEVEL% NEQ 0 (
  color 0C
  echo.
  echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  echo !!! HATA: BUILD ISLEMI BASARISIZ OLDU !!!
  echo !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  pause
  exit /b
)

echo.
echo -----------------------------------------
echo 2. ADIM: FIREBASE'E YUKLENIYOR (DEPLOY)...
echo Guncel dosyalar HER IKI ADRESE DE gonderiliyor.
echo (ikvkasa.web.app ve ikv-kasa-yonetimi.web.app)
echo -----------------------------------------
call firebase deploy

:: Eğer deploy işleminde hata varsa uyar ve beklet (kapanmasın)
IF %ERRORLEVEL% NEQ 0 (
  color 0C
  echo.
  echo !!! HATA: YUKLEME SIRASINDA SORUN OLUSTU !!!
  pause
  exit /b
)

echo.
echo -----------------------------------------
echo ISLEM BASARIYLA TAMAMLANDI!
echo Siteniz her iki adreste de guncellendi.
echo.
echo 3 saniye icinde otomatik kapanacak...
echo -----------------------------------------

:: 3 Saniye bekle ve çıkış yap
timeout /t 3
exit