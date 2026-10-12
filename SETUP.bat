@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Tao file .env tu mau ===
if not exist backend\.env copy backend\.env.example backend\.env
if not exist admin\.env copy admin\.env.example admin\.env
if not exist mini-app\.env copy mini-app\.env.example mini-app\.env
if not exist mini-app\.env.brand_a copy env-templates\mini-app_brand_a.txt mini-app\.env.brand_a
if not exist mini-app\.env.brand_b copy env-templates\mini-app_brand_b.txt mini-app\.env.brand_b

echo === Cai dat backend ===
cd backend
call npm install || goto :err
call npm run db:push || goto :err
call npm run db:seed || goto :err
cd ..
echo === Cai dat admin ===
cd admin
call npm install || goto :err
cd ..
echo === Cai dat mini-app ===
cd mini-app
call npm install || goto :err
cd ..
echo.
echo XONG! Chay START.bat de mo ca 3 phan.
pause
exit /b 0
:err
echo Co loi xay ra, xem thong bao o tren.
pause
exit /b 1
