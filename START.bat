@echo off
cd /d "%~dp0"
start "Backend :4000" cmd /k "cd backend && npm run dev"
start "Admin :5173" cmd /k "cd admin && npm run dev"
start "Mini App :3000" cmd /k "cd mini-app && npm run dev"
timeout /t 8 >nul
start http://localhost:5173
start http://localhost:3000
