@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Style Fusion 一鍵啟動
set "NOOPEN="
if /i "%~1"=="--no-open" set "NOOPEN=1"

echo ==============================
echo   Style Fusion 動效設計風格混合器
echo ==============================
echo.

where node >nul 2>nul
if errorlevel 1 goto :nonode

if not exist "node_modules\" (
  echo [1/3] 第一次使用，正在安裝套件，需要網路，約 1 到 2 分鐘...
  call npm install
  if errorlevel 1 goto :fail
) else (
  echo [1/3] 套件已安裝
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\need-build.ps1"
if errorlevel 1 (
  echo [2/3] 正在建置成品，約十幾秒...
  call npm run build
  if errorlevel 1 goto :fail
) else (
  echo [2/3] 成品已是最新，略過建置
)

echo [3/3] 啟動中，瀏覽器會自動開啟。要結束請關閉這個視窗，或按 Ctrl+C。
echo.
if defined NOOPEN (
  call npx vite preview --host 127.0.0.1 --port 4173
) else (
  call npx vite preview --host 127.0.0.1 --port 4173 --open
)
goto :end

:nonode
if exist "dist\index.html" (
  echo 沒有找到 Node.js，直接用瀏覽器開啟已建置好的成品。
  if not defined NOOPEN start "" "%~dp0dist\index.html"
  goto :end
)
echo 沒有找到 Node.js，而且還沒有建置過的成品。
echo 請先安裝 Node.js 20 以上版本：https://nodejs.org
echo 安裝完成後再雙擊這個檔案一次。
pause
goto :end

:fail
echo.
echo 啟動失敗，請把上面的錯誤訊息貼給我。
pause

:end
endlocal
