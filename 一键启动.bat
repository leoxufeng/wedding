@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 婚礼弹幕墙 · 一键启动

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║       婚礼弹幕墙  ·  一键启动            ║
echo  ╚══════════════════════════════════════════╝
echo.

:: ── 检查环境 ──────────────────────────────────
node -v >nul 2>&1
if errorlevel 1 (
  echo  ❌ 未找到 Node.js，请先安装：https://nodejs.org
  pause & exit /b 1
)
cpolar -v >nul 2>&1
if errorlevel 1 (
  echo  ❌ 未找到 cpolar，请先安装：https://cpolar.cn
  pause & exit /b 1
)

:: ── 安装依赖（首次）──────────────────────────
if not exist "node_modules" (
  echo  📦 首次运行，安装依赖...
  npm install
  echo.
)

:: ── 启动 cpolar（后台）────────────────────────
echo  🌐 正在连接 cpolar 隧道...
taskkill /f /im cpolar.exe >nul 2>&1
start /b cpolar http 3000

:: ── 等待 cpolar 就绪，最多等 15 秒 ──────────
set PUBLIC_URL=
for /L %%i in (1,1,15) do (
  if "!PUBLIC_URL!"=="" (
    timeout /t 1 /nobreak >nul
    for /f "usebackq delims=" %%u in (`powershell -NoProfile -Command ^
      "try{(Invoke-RestMethod 'http://127.0.0.1:4042/api/tunnels').tunnels ^| Where-Object{$_.proto -eq 'https'} ^| Select-Object -First 1 -ExpandProperty public_url}catch{''}" 2^>nul`) do (
      set "PUBLIC_URL=%%u"
    )
  )
)

:: ── 自动获取失败则手动输入 ──────────────────
if "!PUBLIC_URL!"=="" (
  echo.
  echo  ⚠ 未能自动读取公网地址
  echo  请手动打开浏览器访问 http://127.0.0.1:4042
  echo  复制 Forwarding 中的 https:// 地址粘贴到这里：
  echo.
  set /p PUBLIC_URL=  公网地址：
)

:: ── 去掉末尾斜杠 ─────────────────────────────
if "!PUBLIC_URL:~-1!"=="/" set "PUBLIC_URL=!PUBLIC_URL:~0,-1!"

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  ✅ 启动成功！                            ║
echo  ╠══════════════════════════════════════════╣
echo  ║  大屏地址: !PUBLIC_URL!/display.html
echo  ║  宾客扫码: !PUBLIC_URL!/guest.html
echo  ╠══════════════════════════════════════════╣
echo  ║  宾客用 4G/5G 扫码即可，无需连 WiFi       ║
echo  ║  此窗口不要关闭！                         ║
echo  ╚══════════════════════════════════════════╝
echo.

set PUBLIC_URL=!PUBLIC_URL!
node server.js
pause
