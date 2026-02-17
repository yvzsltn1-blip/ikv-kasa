@echo off
set "tarih=%date% %time%"

:: Kullanıcıdan mesaj girişi bekler
set /p user_msg="Degisiklik notunu girin (Bos birakirsan tarih yazilir): "

:: Eğer kullanıcı bir şey yazmadıysa tarih değişkenini ata
if "%user_msg%"=="" (
    set "final_msg=Guncelleme: %tarih%"
) else (
    set "final_msg=%user_msg%"
)

echo.
echo [1/3] Dosyalar hazirlaniyor...
git add .

echo [2/3] Kaydediliyor: %final_msg%
git commit -m "%final_msg%"

echo [3/3] GitHub'a gonderiliyor...
git push

echo.
echo Islem tamamlandi!
pause