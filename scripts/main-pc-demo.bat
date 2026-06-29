@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

rem 프로젝트 루트 확인
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT="

if exist "%SCRIPT_DIR%infra\docker-compose.yml" (
  set "PROJECT_ROOT=%SCRIPT_DIR%"
) else if exist "%SCRIPT_DIR%..\infra\docker-compose.yml" (
  set "PROJECT_ROOT=%SCRIPT_DIR%.."
)

if not defined PROJECT_ROOT (
  echo [error] infra\docker-compose.yml 조회 실패
  echo [guide] 프로젝트 루트 또는 scripts 디렉터리에 파일 배치 필요
  pause
  exit /b 1
)

for %%I in ("%PROJECT_ROOT%") do set "PROJECT_ROOT=%%~fI"
set "ENV_FILE=%PROJECT_ROOT%\infra\.env"
set "COMPOSE_FILE=%PROJECT_ROOT%\infra\docker-compose.yml"

if not exist "%ENV_FILE%" (
  echo [error] infra\.env 파일 없음
  echo [guide] Copy-Item .\infra\.env.example .\infra\.env 실행 필요
  pause
  exit /b 1
)

rem 환경 변수 조회
set "BACKEND_PORT="
set "DASHBOARD_PORT="

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  if /i "%%A"=="PORT" set "BACKEND_PORT=%%B"
  if /i "%%A"=="DASHBOARD_PORT" set "DASHBOARD_PORT=%%B"
)

set "BACKEND_PORT=%BACKEND_PORT:"=%"
set "DASHBOARD_PORT=%DASHBOARD_PORT:"=%"

if not defined BACKEND_PORT (
  echo [error] PORT 환경 변수 없음
  pause
  exit /b 1
)

if not defined DASHBOARD_PORT (
  echo [error] DASHBOARD_PORT 환경 변수 없음
  pause
  exit /b 1
)

cd /d "%PROJECT_ROOT%"

echo ============================================================
echo OfficeGuard Lab Main PC Demo
echo ============================================================
echo Project Root   : %PROJECT_ROOT%
echo Backend Port   : %BACKEND_PORT%
echo Dashboard Port : %DASHBOARD_PORT%
echo.

rem Docker Desktop 확인
docker info >nul 2>&1
if errorlevel 1 (
  echo [error] Docker Desktop 실행 상태 확인 필요
  pause
  exit /b 1
)

rem 서비스 실행 방식 선택
set "REBUILD="
set /p "REBUILD=Docker Image 재빌드 실행 여부 [y/N]: "

if /i "%REBUILD%"=="Y" (
  echo.
  echo [docker] Image 재빌드 및 전체 서비스 실행
  docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up --build -d
) else (
  echo.
  echo [docker] 기존 Image 기반 전체 서비스 실행
  docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" up -d
)

if errorlevel 1 (
  echo [error] Docker Compose 실행 실패
  pause
  exit /b 1
)

rem 서비스 상태 확인
echo.
echo [docker] 서비스 상태 확인
docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" ps

rem Backend Health Check 대기
echo.
echo [health] Backend 시작 대기

powershell.exe -NoProfile -Command ^
  "$uri='http://localhost:%BACKEND_PORT%/health';" ^
  "for($i=1;$i -le 30;$i++){" ^
  "  try {" ^
  "    $result=Invoke-RestMethod -Uri $uri -TimeoutSec 3;" ^
  "    if($result.status -eq 'ok'){" ^
  "      Write-Host '[health] Backend 정상';" ^
  "      $result | ConvertTo-Json -Depth 5;" ^
  "      exit 0" ^
  "    }" ^
  "  } catch {}" ^
  "  Write-Host ('[health] 대기 {0}/30' -f $i);" ^
  "  Start-Sleep -Seconds 2" ^
  "}" ^
  "exit 1"

if errorlevel 1 (
  echo [error] Backend Health Check 실패
  pause
  exit /b 1
)

rem Dashboard 실행
echo.
echo [dashboard] 브라우저 실행
start "" "http://localhost:%DASHBOARD_PORT%"

rem Backend 로그 실행
echo [logs] Backend 로그 창 실행
start "OfficeGuard Backend Logs" powershell.exe -NoExit -NoProfile -Command ^
  "Set-Location -LiteralPath '%PROJECT_ROOT%'; docker compose --env-file '.\infra\.env' -f '.\infra\docker-compose.yml' logs -f backend"

echo.
echo ============================================================
echo Mini PC에서 mini-pc-demo.bat 실행
echo 시나리오 완료 후 아래 입력 진행
echo ============================================================
pause

rem API 확인
echo.
echo [api] 최근 이벤트 조회
powershell.exe -NoProfile -Command ^
  "try { Invoke-RestMethod 'http://localhost:%BACKEND_PORT%/api/events?limit=10' | ConvertTo-Json -Depth 20 } catch { Write-Warning $_.Exception.Message }"

echo.
echo [api] 최근 Rule Hit 조회
powershell.exe -NoProfile -Command ^
  "try { Invoke-RestMethod 'http://localhost:%BACKEND_PORT%/api/rule-hits?limit=10' | ConvertTo-Json -Depth 20 } catch { Write-Warning $_.Exception.Message }"

echo.
echo ============================================================
echo Main PC 서비스 처리
echo K : 서비스 유지
echo S : Container 중지
echo D : Container 삭제
echo V : Container 및 Volume 삭제
echo ============================================================

set "ACTION="
set /p "ACTION=선택 [K/S/D/V]: "

if /i "%ACTION%"=="S" (
  docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" stop
) else if /i "%ACTION%"=="D" (
  docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" down
) else if /i "%ACTION%"=="V" (
  echo [warning] PostgreSQL Volume 데이터 삭제
  docker compose --env-file "%ENV_FILE%" -f "%COMPOSE_FILE%" down -v
) else (
  echo [docker] Main PC 서비스 유지
)

echo.
echo [done] Main PC 시연 스크립트 종료
pause
endlocal
