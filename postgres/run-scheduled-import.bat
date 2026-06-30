@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CSV_PATH=%~1"
set "LOG_DIR=%SCRIPT_DIR%logs"
set "LOG_PATH=%LOG_DIR%\meal-import.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.>> "%LOG_PATH%"
echo [%DATE% %TIME%] Meal Note import started.>> "%LOG_PATH%"

if "%CSV_PATH%"=="" (
  echo [%DATE% %TIME%] ERROR: CSV path is required.>> "%LOG_PATH%"
  exit /b 1
)

if not exist "%CSV_PATH%" (
  echo [%DATE% %TIME%] ERROR: CSV file was not found: %CSV_PATH%>> "%LOG_PATH%"
  exit /b 1
)

call "%SCRIPT_DIR%import-meals.bat" "%CSV_PATH%" >> "%LOG_PATH%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo [%DATE% %TIME%] Meal Note import failed. Exit code: %EXIT_CODE%>> "%LOG_PATH%"
  exit /b %EXIT_CODE%
)

echo [%DATE% %TIME%] Meal Note import completed.>> "%LOG_PATH%"
exit /b 0
