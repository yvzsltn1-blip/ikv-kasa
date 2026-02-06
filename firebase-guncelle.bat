@echo off
title IKV Kasa - Yayina Alma Araci
color 0B

echo -----------------------------------------
echo 1. ADIM: PROJE DERLENIYOR (BUILD)...
echo Lutfen bekleyin, kodlar hazirlaniyor.
echo -----------------------------------------
call npm run build

:: Eğer build işleminde hata varsa işlemi durdur
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
echo Guncel dosyalar sunucuya gonderiliyor.
echo -----------------------------------------
call firebase deploy

:: Eğer deploy işleminde hata varsa uyar
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
echo Siteniz guncellendi.
echo -----------------------------------------
pause