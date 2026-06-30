@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "CSV_PATH=%~1"
set "START_TIME=%~2"
set "TASK_NAME=%~3"

if "%START_TIME%"=="" set "START_TIME=03:00"
if "%TASK_NAME%"=="" set "TASK_NAME=MealNotePostgresImport"

if "%CSV_PATH%"=="" (
  echo Meal Note CSV file path is required.
  echo.
  echo Usage:
  echo   %~nx0 C:\path\to\MealNote.csv [HH:mm] [TaskName]
  echo.
  echo Example:
  echo   %~nx0 C:\Users\ham14\Downloads\MealNote.csv 03:00 MealNotePostgresImport
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

set "TASK_RUN=%SCRIPT_DIR%run-scheduled-import.bat"

schtasks /Create /TN "%TASK_NAME%" /SC DAILY /ST "%START_TIME%" /TR "\"%TASK_RUN%\" \"%CSV_PATH%\"" /F
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Failed to create scheduled task. Exit code: %EXIT_CODE%
  exit /b %EXIT_CODE%
)

echo.
echo Scheduled task was created.
echo   Name: %TASK_NAME%
echo   Time: %START_TIME%
echo   CSV : %CSV_PATH%
echo.
echo Logs:
echo   %SCRIPT_DIR%logs\meal-import.log
exit /b 0
