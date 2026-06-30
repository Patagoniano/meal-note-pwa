@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CSV_PATH=%~1"

if "%CSV_PATH%"=="" (
  echo Meal Note CSV file path is required.
  echo.
  echo Usage:
  echo   %~nx0 C:\path\to\MealNote.csv
  echo.
  echo You can also drag and drop a CSV file onto this batch file.
  echo.
  set /p "CSV_PATH=CSV path: "
)

if "%CSV_PATH%"=="" (
  echo No CSV path was provided.
  exit /b 1
)

if not exist "%CSV_PATH%" (
  echo CSV file was not found:
  echo   %CSV_PATH%
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Import-MealCsv.ps1" -CsvPath "%CSV_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Import failed. Exit code: %EXIT_CODE%
  exit /b %EXIT_CODE%
)

echo.
echo Import completed.
exit /b 0
