# 시연 실행 스크립트

## 1. 개요

Mini PC 실제 이벤트 발생부터 Main PC 수신·처리·저장·분석·시각화까지의 실행 및 확인 절차

```text
Mini PC 실제 행위
→ Agent 이벤트 수집
→ Main PC Event Receiver 전송
→ Kafka Pipeline 처리
→ PostgreSQL 저장
→ Rule-based Analyzer 평가
→ WebSocket 전달
→ Realtime Dashboard 확인
```

### 문서 작성 범위

```text
- 기존 시연 시나리오 목적 및 설명 반복 제외
- 실제 실행 명령
- 실행 순서
- Agent 확인 로그
- Main PC 확인 로그
- REST API 확인
- Dashboard 확인
- 종료 및 정리
```

---

## 2. 시연 준비

### Main PC 준비

```text
- Docker Desktop 실행
- infra/.env 설정 완료
- Kafka, PostgreSQL, Backend, Dashboard 실행
- Backend Health Check 성공
- Dashboard 접속
- Backend 로그 창 실행
```

### Mini PC 준비

```text
- officeguard-agent.exe 배치
- Agent .env 설정 완료
- watch 경로 생성
- DNS Client Operational Log 활성화
- WFP Filtering Platform Connection 성공 감사 활성화
- Main PC Health API 접근 확인
- USB 저장 장치 준비
```

### 시연 설정 확인

`infra/.env` 확인 항목

```text
ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD
ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS
ANALYZER_DNS_SPIKE_WINDOW_SECONDS
ANALYZER_DNS_SPIKE_THRESHOLD
ANALYZER_EXTERNAL_DOMAINS
```

### 설정값 적용 기준

```text
- 파일 크기와 LARGE_FILE_COPY 임계값 일치
- DNS 요청 횟수와 DNS Spike 임계값 일치
- 연속 이벤트 실행 시간과 Rule Window 일치
- 외부 조회 도메인과 ANALYZER_EXTERNAL_DOMAINS 일치
```

### 시연 보조 스크립트

반복 실행 명령 단순화를 위한 Main PC와 Mini PC용 BAT 파일 제공

```text
scripts/
├─ main-pc-demo.bat
└─ mini-pc-demo.bat
````

| 파일  | 실행 위치 | 역할 |
| ----- | -------- | ---- |
| `main-pc-demo.bat` | Main PC 프로젝트 루트 또는 `scripts` | Docker Compose 실행, Health Check, Dashboard·Backend 로그 실행, API 확인 및 서비스 종료 |
| `mini-pc-demo.bat` | Mini PC Agent 실행 디렉터리        | Agent 실행, DNS·USB 파일 복사·DNS Spike·Network Flow 시나리오 실행 및 테스트 파일 정리        |

```text
main-pc-demo.bat 실행
→ Main PC 서비스 및 확인 환경 준비

mini-pc-demo.bat 실행
→ Mini PC 이벤트 발생 및 시연 진행
```

### 스크립트 적용 범위

- 이 문서의 수동 실행 명령과 동일한 시연 흐름 지원
- USB 저장 장치 연결 및 드라이브 문자 입력은 사용자 직접 처리
- Analyzer 임계값과 외부 대상 도메인은 실제 infra/.env 기준 입력
- Mini PC Agent 종료는 Agent 실행 창에서 Ctrl+C 직접 입력
- USB_FILE_COPY_DETECTED 시연 제외 기준 유지

> BAT 파일은 반복 명령 실행을 위한 시연 보조 수단이며, 세부 확인 기준은 이 문서의 각 시나리오 절차를 기준으로 적용


---

## 3. 공통 실행 순서

### 3.1 Main PC 서비스 실행

프로젝트 루트에서 실행

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  up -d
```

#### 소스 또는 Docker 설정 변경 시

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  up --build -d
```

### 3.2 서비스 상태 확인

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  ps
```

### 3.3 Health Check

```powershell
Invoke-RestMethod "http://localhost:4000/health"
```

#### 예상 응답

```json
{
  "status": "ok",
  "service": "officeguard-lab-backend"
}
```

### 3.4 Dashboard 접속

```text
http://localhost:<DASHBOARD_PORT>
```

### 3.5 Backend 로그 확인

별도 PowerShell에서 실행

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f backend
```

#### Event Receiver 로그 필터

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f backend |
  findstr /I /C:"[event-receiver]"
```

### 3.6 Mini PC 연결 확인

Mini PC에서 실행

```powershell
curl.exe "http://<MAIN_PC_IP>:4000/health"
```

### 3.7 Mini PC Agent 실행

Mini PC CMD에서 실행

```cmd
cd /d D:\DEV\OfficeGuardLab
officeguard-agent.exe
```

> 시연 종료 시점까지 Agent 실행 창 유지

---

## 4. 시나리오 1 — DNS 요청 관측

### 4.1 DNS 요청 발생

Mini PC 별도 PowerShell에서 실행

```powershell
ipconfig /flushdns
nslookup -type=A github.com
```

### 4.2 Agent 로그 확인

```text
[agent] DNS_QUERY collected. domain=github.com queryType=A eventId=...
[agent] DNS_QUERY sent. eventId=...
```

### 4.3 Main PC 로그 확인

```text
[event-receiver] accepted. eventType=DNS_QUERY eventId=...
[kafka-producer] published. eventType=DNS_QUERY eventId=...
[kafka-consumer] received. eventType=DNS_QUERY eventId=...
[storage] saved. eventType=DNS_QUERY eventId=...
[websocket] broadcast. eventType=DNS_QUERY eventId=...
```

> 현재 구현 로그 형식 기준 확인

### 4.4 REST API 확인

```powershell
curl.exe "http://localhost:4000/api/events?eventType=DNS_QUERY&deviceId=<AGENT_DEVICE_ID>&limit=10"
```

### 4.5 Dashboard 확인

```text
- LIVE EVENT TIMELINE의 DNS_QUERY 표시
- DNS Query 수 증가
- DNS DOMAIN TOP 10 반영
- Source IP별 DNS 요청량 반영
```

### Privacy 설정 활성화 시

```text
Source IP 익명 식별자 표시
→ anon-ip-...
```

---

## 5. 시나리오 2 — USB 파일 반출 의심 탐지

### 5.1 테스트 파일 생성

Mini PC PowerShell에서 실행

#### `<THRESHOLD_BYTES>` 입력 기준

```text
ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD 이상
```

```powershell
$watchPath = 'D:\DEV\OfficeGuardLab\watch'
$testFile = Join-Path $watchPath 'officeguard-large-demo.bin'
$sizeBytes = <THRESHOLD_BYTES>

$stream = [System.IO.File]::Open(
  $testFile,
  [System.IO.FileMode]::Create
)

$stream.SetLength($sizeBytes)
$stream.Dispose()

Get-Item $testFile |
  Select-Object FullName, Length
```

#### 확인 기준

```text
Length >= ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD
```

### 5.2 USB 저장 장치 연결

Mini PC에 USB 저장 장치 연결

#### Agent 로그 확인

```text
[agent] USB_CONNECTED collected. eventId=...
[agent] USB_CONNECTED sent. eventId=...
```

#### USB 드라이브 문자 확인

```powershell
Get-Volume |
  Where-Object DriveType -eq 'Removable' |
  Select-Object DriveLetter, FileSystemLabel
```

### 5.3 파일 복사

`<USB_DRIVE>`를 실제 USB 드라이브 문자로 변경

```powershell
Copy-Item `
  -Path $testFile `
  -Destination '<USB_DRIVE>:\officeguard-large-demo.bin' `
  -Force
```

#### Agent 로그 확인

```text
[agent] FILE_COPIED collected. eventId=...
[agent] FILE_COPIED sent. eventId=...
```

### 5.4 대용량 파일 복사 Rule 확인

#### 확인 Rule

```text
LARGE_FILE_COPY_DETECTED
```

#### REST API 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?ruleId=LARGE_FILE_COPY_DETECTED&deviceId=<AGENT_DEVICE_ID>&limit=10"
```

#### 예상 Severity

```text
MEDIUM
```

### 5.5 외부 전송 대상 도메인 조회

#### `<EXTERNAL_DOMAIN>` 입력 기준

```text
ANALYZER_EXTERNAL_DOMAINS 등록 도메인
```

#### 실행 시간 기준

```text
FILE_COPIED 발생
→ ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS 이내 DNS 요청
```

```powershell
nslookup -type=A <EXTERNAL_DOMAIN>
```

### 5.6 외부 대상 도메인 연계 Rule 확인

#### 확인 Rule

```text
FILE_COPY_EXTERNAL_DOMAIN_DETECTED
```

#### REST API 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?ruleId=FILE_COPY_EXTERNAL_DOMAIN_DETECTED&deviceId=<AGENT_DEVICE_ID>&limit=10"
```

#### 예상 Severity

```text
HIGH
```

### 5.7 Dashboard 확인

```text
- FILE_COPIED 표시
- MEDIUM LARGE_FILE_COPY_DETECTED 표시
- HIGH FILE_COPY_EXTERNAL_DOMAIN_DETECTED 표시
- Rule Hit 수 증가
- HIGH / CRITICAL 건수 반영
```

### 민감 도메인 마스킹 활성화 시

```text
PostgreSQL 및 Dashboard 표시값
→ [masked-domain]
```

> 마스킹 전 원본 도메인 기반 Analyzer 평가 유지

### 5.8 시연 제외 Rule

```text
USB_FILE_COPY_DETECTED
```

#### 제외 기준

```text
- 기존 구현 유지
- Phase 12 시연 확인 대상 제외
- 재현 가능한 런타임 검증 방법 미확보
- 성공 결과 임의 문서화 제외
```

---

## 6. 시나리오 3 — DNS 요청량 급증 탐지

### 6.1 설정값 확인

#### `<DNS_SPIKE_THRESHOLD>` 입력 기준

```text
ANALYZER_DNS_SPIKE_THRESHOLD
```

#### 요청 발생 시간 범위

```text
ANALYZER_DNS_SPIKE_WINDOW_SECONDS
```

### 6.2 DNS 요청 반복 실행

Mini PC PowerShell에서 실행

```powershell
$threshold = <DNS_SPIKE_THRESHOLD>

1..$threshold | ForEach-Object {
  $domain = "officeguard-spike-$_.example.net"

  nslookup -type=A $domain 1.1.1.1 |
    Out-Null
}
```

### 6.3 Agent 확인

```text
- DNS_QUERY 이벤트 연속 생성
- 이벤트별 고유 eventId 생성
- Main PC Event Receiver 전송 성공
```

### 6.4 Main PC 확인

```text
Rule ID: DNS_QUERY_SPIKE_DETECTED
Severity: MEDIUM
```

#### REST API 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?ruleId=DNS_QUERY_SPIKE_DETECTED&deviceId=<AGENT_DEVICE_ID>&limit=10"
```

### 6.5 Dashboard 확인

```text
- DNS Query 수 증가
- Source IP별 DNS 요청량 Chart 반영
- MEDIUM DNS_QUERY_SPIKE_DETECTED 표시
- 관련 DNS eventId의 relatedEventIds 포함
```

### 반복 탐지 제한

```text
동일 Source IP
→ ANALYZER_DNS_SPIKE_WINDOW_SECONDS 동안 반복 탐지 제한
```

### 연속 재시연

```text
ANALYZER_DNS_SPIKE_WINDOW_SECONDS 이상 대기
→ DNS 요청 반복 실행
```

---

## 7. 시나리오 4 — Network Flow 관측

### 7.1 TCP 연결 발생

Mini PC PowerShell에서 실행

```powershell
curl.exe "https://example.com"
```

### 7.2 Agent 로그 확인

```text
[agent] NETWORK_FLOW collected. destination=...:443 protocol=TCP eventId=...
[agent] NETWORK_FLOW sent. eventId=...
```

### 7.3 REST API 확인

```powershell
curl.exe "http://localhost:4000/api/events?eventType=NETWORK_FLOW&deviceId=<AGENT_DEVICE_ID>&limit=20"
```

#### 확인 필드

```text
sourceIp
metadata.destinationIp
metadata.destinationPort
metadata.protocol
```

### 7.4 UDP 연결 확인

DNS 요청 기반 UDP Network Flow 발생

```powershell
nslookup github.com 1.1.1.1
```

#### 확인 예시

```text
destinationIp: 1.1.1.1
destinationPort: 53
protocol: UDP
```

### 확인 기준

```text
- Windows Security Event 실제 기록 기준 확인
- 환경에 따른 DNS TCP 전환 가능
- UDP 미수집 시 임의 성공 처리 제외
```

### 7.5 Dashboard 확인

```text
- LIVE EVENT TIMELINE의 NETWORK_FLOW 표시
- TCP 연결 이벤트 표시
- 수집된 경우 UDP 연결 이벤트 표시
- 패킷 Payload 미표시
- HTTPS 본문 미표시
```

### 7.6 Agent Receiver 연결 제외 확인

Agent의 Event Receiver 전송 연결에 대한 `NETWORK_FLOW` 재생성 제외

#### 제외 대상

```text
destinationIp: <MAIN_PC_IP>
destinationPort: <EVENT_RECEIVER_PORT>
```

---

## 8. 시연 종료

### 8.1 Mini PC Agent 종료

Agent 실행 CMD에서 입력

```text
Ctrl+C
```

#### 예상 로그

```text
[agent] shutdown requested. signal=SIGINT
[agent] stopped
```

### 8.2 Mini PC 테스트 파일 삭제

```powershell
Remove-Item `
  D:\DEV\OfficeGuardLab\watch\officeguard-large-demo.bin `
  -ErrorAction SilentlyContinue
```

### 8.3 USB 테스트 파일 삭제

```powershell
Remove-Item `
  '<USB_DRIVE>:\officeguard-large-demo.bin' `
  -ErrorAction SilentlyContinue
```

### 8.4 Main PC 서비스 종료

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  down
```

### 8.5 Container 중지

Container 삭제 없이 중지만 수행

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  stop
```

### 8.6 Volume 포함 삭제

PostgreSQL Volume 포함 삭제

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  down -v
```

> `down -v` 실행 시 PostgreSQL 저장 이벤트 삭제
