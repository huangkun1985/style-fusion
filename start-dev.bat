@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Style Fusion 開發模式
set "NOOPEN="
if /i "%~1"=="--no-open" set "NOOPEN=1"

where node >nul 2>nul
if errorlevel 1 (
  echo 沒有找到 Node.js，請先安裝 20 以上版本：https://nodejs.org
  pause
  goto :end
)

if not exist "node_modules\" (
  echo 第一次使用，正在安裝套件，需要網路，約 1 到 2 分鐘...
  call npm install
  if errorlevel 1 goto :fail
)

echo 開發模式啟動中，改程式存檔後畫面會自動更新。要結束請關閉這個視窗，或按 Ctrl+C。
echo.
if defined NOOPEN (
  call npx vite
) else (
  call npx vite --open
)
goto :end

:fail
echo.
echo 安裝失敗，請把上面的錯誤訊息貼給我。
pause

:end
endlocal
