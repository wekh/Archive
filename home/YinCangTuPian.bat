@echo off
title Windows Spotlight Icon Manager
echo 在启用 Windows 聚焦时，帮助你快速隐藏/显示“了解此图片”图标。
echo.
echo 0. 关闭此脚本
echo 1. 禁用
echo 2. 启用
set /p choose=请选择一个数字：

if %choose%==0 exit

set regPath=HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel
set regValue="{2cc5ca98-6485-489a-920e-b3e88a6ccce3}"

if %choose%==1 (
    echo 请在接下来的选项中点击“是”
    reg add "%regPath%" /v %regValue% /t REG_DWORD /d 1 /f >nul
    cls
    echo 已隐藏“了解此图片”图标。
) else if %choose%==2 (
    echo 请在接下来的选项中点击“是”
    reg delete "%regPath%" /v %regValue% /f >nul
    cls
    echo 已显示“了解此图片”图标。
)

echo 正在重启文件资源管理器...
taskkill /f /im explorer.exe
start explorer.exe
exit
