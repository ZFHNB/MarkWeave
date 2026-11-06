@echo off
if "%~1"=="--version" (
  echo pandoc 3.1.9
  exit /b 0
)
set "OUT="
set "PREV="
:loop
if "%~1"=="" goto done
if "%PREV%"=="-o" set "OUT=%~1"
set "PREV=%~1"
shift
goto loop
:done
if defined OUT (
  echo FAKE-DOCX-CONTENT> "%OUT%"
  exit /b 0
)
exit /b 2
