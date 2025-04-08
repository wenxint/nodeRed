@echo off
@REM set pythonpath=%~dp0..\Python\Win64\Python37\python.exe
set scriptPath=%~dp0RedLogDecompress.py
set logpath=%1
python %scriptPath% %1
echo Decompress success!!!
pause