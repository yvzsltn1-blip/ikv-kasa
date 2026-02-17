@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Github Otomatik Guncelleyici
color 0A

REM Her zaman bu .bat dosyasinin bulundugu klasorde calis.
cd /d "%~dp0"

set "REMOTE_URL=https://github.com/yvzsltn1-blip/ikv-kasa.git"
set "BRANCH=main"

echo -----------------------------------------
echo GITHUB GUNCELLEME BASLATIYOR...
echo Hedef Repo: %REMOTE_URL%
echo -----------------------------------------

where git >nul 2>&1
if errorlevel 1 (
  color 0C
  echo HATA: Git bulunamadi. Git kurup tekrar deneyin.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  color 0E
  echo Bilgi: Bu klasorde git deposu yok. Yeni depo olusturuluyor...
  git init >nul 2>&1
  if errorlevel 1 (
    color 0C
    echo HATA: Git deposu olusturulamadi.
    pause
    exit /b 1
  )
)

git checkout -B %BRANCH% >nul 2>&1

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin %REMOTE_URL%
) else (
  git remote set-url origin %REMOTE_URL%
)

git add -A

git diff --cached --quiet
if not errorlevel 1 (
  git rev-parse --verify HEAD >nul 2>&1
  if not errorlevel 1 (
    color 0E
    echo Bilgi: Gonderilecek yeni degisiklik yok.
    pause
    exit /b 0
  )
)

set "MESAJ="
echo.
set /p "MESAJ=Commit mesaji (Enter = otomatik): "
if "%MESAJ%"=="" set "MESAJ=Otomatik guncelleme: %date% %time%"

git commit -m "%MESAJ%" >nul 2>&1
if errorlevel 1 (
  echo Bilgi: Commit atlandi (degisiklik olmayabilir).
)

echo.
echo Github ile senkronize ediliyor...
git pull --rebase origin %BRANCH% >nul 2>&1

echo Yukleniyor (push)...
git push -u origin %BRANCH%
if errorlevel 1 (
  color 0C
  echo.
  echo HATA: Push islemi basarisiz oldu.
  echo Kontroller:
  echo 1. Repo adresi dogru mu?
  echo 2. Github erisim izni var mi?
  echo 3. Uzak repoda korumali branch kurali var mi?
  pause
  exit /b 1
)

color 0A
echo.
echo -----------------------------------------
echo ISLEM BASARIYLA TAMAMLANDI.
echo Dosyalar Github'a yuklendi.
echo -----------------------------------------
pause
exit /b 0
