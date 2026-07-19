@echo off
set PORT=9222
set PROFILE=%TEMP%\visual-parser-chrome-profile

echo.
echo ============================================
echo  Visual Parser - Chrome с remote debugging
echo ============================================
echo.
echo 1) Откроется Chrome на порту %PORT%
echo 2) В нём открой нужный сайт и залогинься
echo 3) В VS Code: Settings -^> visualParser.cdpEndpoint
echo    значение: http://127.0.0.1:%PORT%
echo 4) Команда "Visual Parser: Open browser"
echo.

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else (
  echo Chrome не найден. Установи Google Chrome.
  pause
  exit /b 1
)

start "" %CHROME% --remote-debugging-port=%PORT% --user-data-dir="%PROFILE%" --no-first-run --no-default-browser-check "about:blank"

echo Chrome запущен. Не закрывай это окно-профиль, пока работаешь с парсером.
pause
