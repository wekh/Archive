@echo off
title Windows Spotlight Icon Manager
echo ������ Windows �۽�ʱ���������������/��ʾ���˽��ͼƬ��ͼ�ꡣ
echo.
echo 0. �رմ˽ű�
echo 1. ����
echo 2. ����
set /p choose=��ѡ��һ�����֣�

if %choose%==0 exit

set regPath=HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel
set regValue="{2cc5ca98-6485-489a-920e-b3e88a6ccce3}"

if %choose%==1 (
    echo ���ڽ�������ѡ���е�����ǡ�
    reg add "%regPath%" /v %regValue% /t REG_DWORD /d 1 /f >nul
    cls
    echo �����ء��˽��ͼƬ��ͼ�ꡣ
) else if %choose%==2 (
    echo ���ڽ�������ѡ���е�����ǡ�
    reg delete "%regPath%" /v %regValue% /f >nul
    cls
    echo ����ʾ���˽��ͼƬ��ͼ�ꡣ
)

echo ���������ļ���Դ������...
taskkill /f /im explorer.exe
start explorer.exe
exit
