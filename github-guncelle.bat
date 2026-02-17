@echo off
set /p commit_mesaji="Degisiklik notunu yazin: "

echo.
echo [1/3] Dosyalar hazirlaniyor...
git add .

echo [2/3] Degisiklikler kaydediliyor...
git commit -m "%commit_mesaji%"

echo [3/3] GitHub'a gonderiliyor...
git push

echo.
echo Islem tamamlandi!
pause