@echo off
%~dp0../../../../../RedTools/Python/Win64/Python37/python.exe %~dp0../../../../../Plugins/AutomationTools/Content/Python/Package/ProtoEnumConvert.py %~dp0../../../../../ -class
if %errorlevel% == 0 (
    echo Create "Content\Script\Red\Net\ProtoEnum"  success!
    echo Create "Content\Script\Red\Net\ProtoClass" success!
)
pause