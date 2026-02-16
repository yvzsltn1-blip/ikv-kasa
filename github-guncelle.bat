@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Github Otomatik Guncelleyici
color 0A

echo -----------------------------------------
echo GITHUB GUNCELLEME BASLATIYOR...
echo -----------------------------------------

REM 1) Git repo kontrolu
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  color 0C
  echo HATA: Bu klasor bir git deposu degil.
  echo Lutfen .git olan proje klasorunde bu dosyayi calistirin.
  pause
  exit /b 1
)

REM 2) Aktif branch al
set "BRANCH="
for /f "delims=" %%b in ('git branch --show-current 2^>nul') do set "BRANCH=%%b"
if "%BRANCH%"=="" (
  color 0C
  echo HATA: Aktif branch tespit edilemedi.
  pause
  exit /b 1
)

REM 3) Uzak repo kontrolu
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  color 0C
  echo HATA: origin remote tanimli degil.
  echo once su komutu calistirin:
  echo git remote add origin ^<github-repo-url^>
  pause
  exit /b 1
)

REM 4) Tum degisiklikleri ekle
git add .
if errorlevel 1 (
  color 0C
  echo HATA: git add basarisiz.
  pause
  exit /b 1
)

REM 5) Degisiklik var mi?
git diff --cached --quiet
if not errorlevel 1 (
  color 0E
  echo Bilgi: Commitlenecek degisiklik yok.
  timeout /t 2 >nul
  exit /b 0
)

REM 6) Commit mesaji
set "mesaj="
set /p "mesaj=Commit mesaji yazin (bos gecerseniz tarih/saat eklenir): "
if "%mesaj%"=="" set "mesaj=Otomatik guncelleme: %date% %time%"

REM 7) Commit
git commit -m "%mesaj%"
if errorlevel 1 (
  color 0C
  echo HATA: Commit basarisiz.
  pause
  exit /b 1
)

REM 8) Uzak degisiklikleri al ve kendi commitini uzerine tası (lineer gecmis)
echo.
echo Uzak degisiklikler cekiliyor (pull --rebase)...
git pull --rebase origin %BRANCH%
if errorlevel 1 (
  color 0C
  echo HATA: pull --rebase basarisiz.
  echo Muhtemelen cakismaniz var. Dosyalari duzeltip su komutlari calistirin:
  echo   git add ^<dosya^>
  echo   git rebase --continue
  echo Iptal etmek icin:
  echo   git rebase --abort
  pause
  exit /b 1
)

REM 9) Push (upstream yoksa otomatik kur)
echo.
echo Push yapiliyor... branch: %BRANCH%
git push -u origin %BRANCH%
if errorlevel 1 (
  color 0C
  echo HATA: Push basarisiz.
  echo Not: Uzak branch sizden ileride olabilir. Tekrar deneyin.
  pause
  exit /b 1
)

echo.
echo -----------------------------------------
echo ISLEM BASARIYLA TAMAMLANDI.
echo Branch: %BRANCH%
echo -----------------------------------------
timeout /t 2 >nul
exit /b 0
