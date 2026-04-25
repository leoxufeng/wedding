@echo off
chcp 65001 >nul
title 婚礼弹幕墙

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        婚礼弹幕墙  ·  启动中...           ║
echo  ╚══════════════════════════════════════════╝
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
  echo  ❌ 未检测到 Node.js，请先安装：https://nodejs.org
  pause
  exit /b 1
)

:: 安装依赖（首次）
if not exist "node_modules" (
  echo  📦 首次运行，安装依赖包...
  npm install
  echo.
)

:: 启动服务
echo  🚀 启动服务...
echo  大屏地址和宾客地址将在下方显示
echo  按 Ctrl+C 停止服务
echo.
node server.js
pause
