@echo off
chcp 65001 >nul
title 婚礼弹幕墙 · 公网模式

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║      婚礼弹幕墙  ·  公网模式（cpolar 内网穿透）      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  【使用前提】
echo  1. 已安装 Node.js（https://nodejs.org）
echo  2. 已安装 cpolar 并登录（https://cpolar.cn）
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
  echo  ❌ 未检测到 Node.js，请先安装
  pause & exit /b 1
)

:: 检查 cpolar
cpolar -v >nul 2>&1
if errorlevel 1 (
  echo  ❌ 未检测到 cpolar，请先安装并登录
  echo     下载地址: https://cpolar.cn/download
  pause & exit /b 1
)

:: 安装依赖
if not exist "node_modules" (
  echo  📦 安装依赖...
  npm install
)

echo.
echo  🌐 正在申请公网地址（请稍候）...
echo.

:: 后台启动 cpolar，输出到临时文件
start /b cpolar http 3000 --log-level=info > "%TEMP%\cpolar_out.txt" 2>&1

:: 等待 cpolar 生成地址（最多15秒）
set PUBLIC_URL=
for /L %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  for /f "tokens=*" %%a in ('findstr /i "https://" "%TEMP%\cpolar_out.txt" 2^>nul') do (
    set "LINE=%%a"
  )
  if not "!LINE!"=="" goto :found_url
)

:: 手动输入兜底
echo  ⚠  未能自动读取公网地址，请手动输入：
echo  （在另一个命令行窗口运行 cpolar http 3000，
echo   然后复制 Forwarding 那行的 https:// 地址粘贴到这里）
echo.
set /p PUBLIC_URL=  公网地址（如 https://abcd-1234.cpolar.io）：
goto :start_server

:found_url
:: 从 cpolar 日志里提取 https URL
for /f "tokens=2" %%b in ('findstr /i "https://" "%TEMP%\cpolar_out.txt"') do (
  set PUBLIC_URL=%%b
  goto :start_server
)

:start_server
echo.
echo  ✅ 公网地址: %PUBLIC_URL%
echo  📱 宾客扫码地址: %PUBLIC_URL%/guest.html
echo  🖥  大屏地址: %PUBLIC_URL%/display.html
echo.
echo  请将大屏地址在婚礼屏幕上打开，宾客扫二维码即可用 4G 参与！
echo  ─────────────────────────────────────────────────────────
echo.

set PUBLIC_URL=%PUBLIC_URL%
node server.js
pause
