@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

rem Agent 경로 확인
set "AGENT_DIR=%~dp0"
for %%I in ("%AGENT_DIR%") do set "AGENT_DIR=%%~fI"

set "AGENT_EXE=%AGENT_DIR%\officeguard-agent.exe"
set "AGENT_ENV=%AGENT_DIR%\.env"
set "WATCH_DIR=%AGENT_DIR%\watch"
set "TEST_FILE=%WATCH_DIR%\officeguard-large-demo.bin"

if not exist "%AGENT_EXE%" (
  echo [error] officeguard-agent.exe 파일 없음
  echo [guide] BAT 파일과 Agent 실행 파일의 동일 디렉터리 배치 필요
  pause
  exit /b 1
)

if not exist "%AGENT_ENV%" (
  echo [error] Agent .env 파일 없음
  pause
  exit /b 1
)

if not exist "%WATCH_DIR%" (
  mkdir "%WATCH_DIR%"
)

rem 관리자 권한 확인
fltmc >nul 2>&1
if errorlevel 1 (
  echo [error] 관리자 권한 실행 필요
  echo [guide] BAT 파일 우클릭 후 관리자 권한으로 실행
  pause
  exit /b 1
)

rem Agent 환경 변수 조회
set "AGENT_RECEIVER_URL="
set "AGENT_DEVICE_ID="

for /f "usebackq tokens=1,* delims==" %%A in ("%AGENT_ENV%") do (
  if /i "%%A"=="AGENT_RECEIVER_URL" set "AGENT_RECEIVER_URL=%%B"
  if /i "%%A"=="AGENT_DEVICE_ID" set "AGENT_DEVICE_ID=%%B"
)

set "AGENT_RECEIVER_URL=%AGENT_RECEIVER_URL:"=%"
set "AGENT_DEVICE_ID=%AGENT_DEVICE_ID:"=%"

if not defined AGENT_RECEIVER_URL (
  echo [error] AGENT_RECEIVER_URL 환경 변수 없음
  pause
  exit /b 1
)

rem Health URL 생성
set "HEALTH_URL="

for /f "usebackq delims=" %%U in (`powershell.exe -NoProfile -Command ^
  "$uri=[Uri]'%AGENT_RECEIVER_URL%'; $uri.GetLeftPart([System.UriPartial]::Authority) + '/health'"`) do (
  set "HEALTH_URL=%%U"
)

if not defined HEALTH_URL (
  echo [error] Main PC Health URL 생성 실패
  pause
  exit /b 1
)

echo ============================================================
echo OfficeGuard Lab Mini PC Demo
echo ============================================================
echo Agent Directory : %AGENT_DIR%
echo Device ID       : %AGENT_DEVICE_ID%
echo Receiver URL    : %AGENT_RECEIVER_URL%
echo Health URL      : %HEALTH_URL%
echo.

rem Main PC 연결 확인
echo [health] Main PC 연결 확인
curl.exe --fail --silent --show-error "%HEALTH_URL%"
if errorlevel 1 (
  echo.
  echo [error] Main PC Health API 접근 실패
  pause
  exit /b 1
)

echo.
echo [health] Main PC 연결 정상

rem Agent 실행
echo.
echo [agent] Agent 실행 창 생성
start "OfficeGuard Agent" /D "%AGENT_DIR%" cmd.exe /k officeguard-agent.exe

timeout /t 4 /nobreak >nul

echo.
echo ============================================================
echo 시나리오 1 - DNS 요청 관측
echo ============================================================

ipconfig /flushdns
nslookup -type=A github.com

echo.
echo [check] Agent 로그 및 Main PC Dashboard의 DNS_QUERY 확인
pause

echo.
echo ============================================================
echo 시나리오 2 - USB 파일 반출 의심 탐지
echo ============================================================

set "THRESHOLD_BYTES="
set /p "THRESHOLD_BYTES=ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD 이상 Byte 입력: "

echo %THRESHOLD_BYTES%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo [error] 숫자 형식의 Byte 값 필요
  pause
  exit /b 1
)

rem 대용량 테스트 파일 생성
powershell.exe -NoProfile -Command ^
  "$path='%TEST_FILE%';" ^
  "$stream=[System.IO.File]::Open($path,[System.IO.FileMode]::Create);" ^
  "$stream.SetLength([Int64]%THRESHOLD_BYTES%);" ^
  "$stream.Dispose();" ^
  "Get-Item -LiteralPath $path | Select-Object FullName,Length"

if errorlevel 1 (
  echo [error] 테스트 파일 생성 실패
  pause
  exit /b 1
)

echo.
echo [usb] USB 저장 장치 연결 후 Enter
pause >nul

echo.
echo [usb] Removable Volume 조회
powershell.exe -NoProfile -Command ^
  "Get-Volume | Where-Object DriveType -eq 'Removable' | Select-Object DriveLetter,FileSystemLabel"

set "USB_DRIVE="
set /p "USB_DRIVE=USB 드라이브 문자 입력 예시 E: "
set "USB_DRIVE=%USB_DRIVE::=%"

echo %USB_DRIVE%| findstr /r /i "^[A-Z]$" >nul
if errorlevel 1 (
  echo [error] USB 드라이브 문자 형식 오류
  pause
  exit /b 1
)

set "USB_TEST_FILE=%USB_DRIVE%:\officeguard-large-demo.bin"

echo.
echo [file] USB 대상 파일 복사
copy /y "%TEST_FILE%" "%USB_TEST_FILE%"

if errorlevel 1 (
  echo [error] USB 파일 복사 실패
  pause
  exit /b 1
)

echo.
echo [check] LARGE_FILE_COPY_DETECTED 확인
pause

set "EXTERNAL_DOMAIN="
set /p "EXTERNAL_DOMAIN=ANALYZER_EXTERNAL_DOMAINS 등록 도메인 입력: "

if not defined EXTERNAL_DOMAIN (
  echo [error] 외부 대상 도메인 입력 필요
  pause
  exit /b 1
)

echo.
echo [dns] 외부 대상 도메인 조회
nslookup -type=A %EXTERNAL_DOMAIN%

echo.
echo [check] FILE_COPY_EXTERNAL_DOMAIN_DETECTED 확인
pause

echo.
echo ============================================================
echo 시나리오 3 - DNS 요청량 급증 탐지
echo ============================================================

set "DNS_SPIKE_THRESHOLD="
set /p "DNS_SPIKE_THRESHOLD=ANALYZER_DNS_SPIKE_THRESHOLD 입력: "

echo %DNS_SPIKE_THRESHOLD%| findstr /r "^[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo [error] 숫자 형식의 DNS Spike Threshold 필요
  pause
  exit /b 1
)

powershell.exe -NoProfile -Command ^
  "$threshold=[Int32]%DNS_SPIKE_THRESHOLD%;" ^
  "1..$threshold | ForEach-Object {" ^
  "  $domain=('officeguard-spike-{0}.example.net' -f $_);" ^
  "  nslookup -type=A $domain 1.1.1.1 | Out-Null" ^
  "}"

echo.
echo [check] DNS_QUERY_SPIKE_DETECTED 확인
pause

echo.
echo ============================================================
echo 시나리오 4 - Network Flow 관측
echo ============================================================

echo.
echo [network] TCP 연결 발생
curl.exe "https://example.com" >nul

echo.
echo [network] UDP Network Flow 발생 시도
nslookup github.com 1.1.1.1

echo.
echo [check] NETWORK_FLOW 및 protocol 확인
pause

echo.
echo ============================================================
echo 시연 종료
echo ============================================================
echo [agent] 별도 Agent 창에서 Ctrl+C 입력
echo [agent] shutdown requested 및 stopped 로그 확인
pause

set "CLEANUP="
set /p "CLEANUP=테스트 파일 삭제 여부 [Y/n]: "

if /i not "%CLEANUP%"=="N" (
  if exist "%TEST_FILE%" del /q "%TEST_FILE%"
  if exist "%USB_TEST_FILE%" del /q "%USB_TEST_FILE%"
  echo [cleanup] 테스트 파일 삭제 완료
) else (
  echo [cleanup] 테스트 파일 유지
)

echo.
echo [done] Mini PC 시연 스크립트 종료
pause
endlocal
