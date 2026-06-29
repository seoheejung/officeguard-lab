# 실행 방법

## 1. 개요

Main PC의 Backend, Kafka, PostgreSQL, Dashboard와 Mini PC Agent 실행 절차

```text
Main PC 환경 변수 준비
→ Kafka 및 PostgreSQL 실행
→ Backend 및 Dashboard 실행
→ Mini PC Agent 실행
→ 이벤트 수집·저장·전달 확인
```

---

## 2. 환경 변수 준비

Main PC와 Mini PC에서 서로 다른 `.env` 파일 사용

```text
Main PC
→ officeguard-lab/infra/.env

Mini PC
→ D:\DEV\OfficeGuardLab\.env
```

> 실제 IP, 비밀번호, 익명화 Key, 민감 도메인 목록은 Git 저장 제외

### 2.1 Main PC 환경 변수 준비

프로젝트 루트에서 예제 파일 복사

```powershell
Copy-Item .\infra\.env.example .\infra\.env
```

> `infra/.env`에 실제 실행값 입력

#### 환경 변수

```text
NODE_ENV
PORT

KAFKA_CLIENT_ID
KAFKA_BROKERS
KAFKA_DOCKER_BROKERS
KAFKA_SECURITY_EVENTS_TOPIC
KAFKA_CONSUMER_GROUP_ID

POSTGRES_HOST
POSTGRES_DOCKER_HOST
POSTGRES_PORT
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD

ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD
ANALYZER_USB_FILE_COPY_WINDOW_SECONDS
ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS
ANALYZER_DNS_SPIKE_WINDOW_SECONDS
ANALYZER_DNS_SPIKE_THRESHOLD
ANALYZER_EXTERNAL_DOMAINS

DASHBOARD_PORT
DASHBOARD_BACKEND_URL
DASHBOARD_DOCKER_BACKEND_URL

PRIVACY_SOURCE_IP_ANONYMIZATION_ENABLED
PRIVACY_SOURCE_IP_ANONYMIZATION_KEY
PRIVACY_DOMAIN_MASKING_ENABLED
PRIVACY_SENSITIVE_DOMAINS
PRIVACY_EVENT_RETENTION_DAYS
PRIVACY_RETENTION_CLEANUP_INTERVAL_MS
```

#### 적용 기준

```text
- 실제 환경 변수 이름은 infra/.env.example 기준 확인
- Docker 전달 변수는 infra/docker-compose.yml 기준 확인
- 실제 IP, 비밀번호, 익명화 Key, 민감 도메인 입력
- 코드 내부 실행값 기본값 사용 제외
- infra/.env의 Git 저장 제외
```

### 2.2 Mini PC Agent 환경 변수 준비

Mini PC Agent는 `officeguard-agent.exe`와 같은 디렉터리의 `.env` 사용

```text
D:\DEV\OfficeGuardLab\
├─ officeguard-agent.exe
├─ .env
└─ watch\
```

#### 환경 변수

| 환경 변수                                | 역할                              |
| ------------------------------------ | ------------------------------- |
| `AGENT_RECEIVER_URL`                 | Main PC Event Receiver 전체 URL   |
| `AGENT_DEVICE_ID`                    | Mini PC 식별자                     |
| `AGENT_USER_ALIAS`                   | 사용자 별칭                          |
| `AGENT_NETWORK_INTERFACE`            | Mini PC 내부 IPv4 조회 대상 Interface |
| `AGENT_REQUEST_TIMEOUT_MS`           | Event Receiver 요청 제한 시간         |
| `AGENT_FILE_WATCH_PATH`              | 일반 파일 이벤트 감시 경로                 |
| `AGENT_FILE_EVENT_DEBOUNCE_MS`       | 동일 파일 이벤트 중복 제한 시간              |
| `AGENT_USB_COPY_SETTLE_INTERVAL_MS`  | USB 대상 파일 상태 재확인 간격             |
| `AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS` | USB 대상 파일 상태 최대 확인 횟수           |

#### `.env` 구성 형식

```dotenv
AGENT_RECEIVER_URL=http://<MAIN_PC_IP>:<PORT>/api/agent/events
AGENT_DEVICE_ID=<AGENT_DEVICE_ID>
AGENT_USER_ALIAS=<AGENT_USER_ALIAS>
AGENT_NETWORK_INTERFACE=<NETWORK_INTERFACE>
AGENT_REQUEST_TIMEOUT_MS=<REQUEST_TIMEOUT_MS>
AGENT_FILE_WATCH_PATH=D:\DEV\OfficeGuardLab\watch
AGENT_FILE_EVENT_DEBOUNCE_MS=<FILE_EVENT_DEBOUNCE_MS>
AGENT_USB_COPY_SETTLE_INTERVAL_MS=<USB_COPY_SETTLE_INTERVAL_MS>
AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS=<USB_COPY_SETTLE_MAX_ATTEMPTS>
```

#### 적용 기준

```text
- AGENT_RECEIVER_URL에 Main PC Event Receiver 전체 URL 입력
- AGENT_NETWORK_INTERFACE에 Mini PC 실제 Network Interface 이름 입력
- AGENT_FILE_WATCH_PATH와 실제 watch 디렉터리 일치
- 각 환경 변수 한 줄 단위 작성
- 동일 환경 변수 중복 작성 제외
- 환경 변수 사이 줄바꿈 유지
- Agent .env의 Git 저장 제외
```

---

## 3. Main PC 로컬 개발 실행

Kafka와 PostgreSQL은 Docker Compose로 실행하고, Backend와 Dashboard는 로컬에서 실행

### Kafka 및 PostgreSQL 실행

프로젝트 루트에서 실행

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  up -d kafka postgres
```

### 서비스 상태 확인

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  ps
```

### Backend 실행

별도 PowerShell에서 프로젝트 루트 기준 실행

```powershell
cd backend

pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

### Dashboard 실행

별도 PowerShell에서 프로젝트 루트 기준 실행

```powershell
cd dashboard

pnpm install
pnpm typecheck
pnpm build
pnpm dev
```

### 확인 주소

```text
Backend Health
http://localhost:4000/health

Event API
http://localhost:4000/api/events

Rule Hit API
http://localhost:4000/api/rule-hits

WebSocket
ws://localhost:4000/ws

Dashboard
http://localhost:<DASHBOARD_PORT>
```

`DASHBOARD_PORT`가 `5173`인 경우:

```text
http://localhost:5173
```

---

## 4. Main PC 빌드 검증

각 명령은 프로젝트 루트에서 실행

### Backend

```powershell
cd backend

pnpm install
pnpm typecheck
pnpm build
pnpm start
```

### Dashboard

```powershell
cd dashboard

pnpm install
pnpm typecheck
pnpm build
```

---

## 5. Main PC Docker Compose 실행

프로젝트 루트에서 실행

### 기존 Image 기반 실행

소스와 Docker 설정 변경이 없는 경우

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  up -d
```

### Image 재빌드 후 실행

소스 또는 Docker 설정을 변경한 경우

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  up --build -d
```

### 서비스 상태 확인

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  ps
```

### Health Check

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

### Dashboard 접속

```text
http://localhost:<DASHBOARD_PORT>
```

`DASHBOARD_PORT`가 `5173`인 경우:

```text
http://localhost:5173
```

---

## 6. Mini PC Agent 빌드

Main PC의 프로젝트 `agent` 디렉터리에서 실행

```powershell
cd agent

pnpm install
pnpm typecheck
pnpm build
```

### 생성 파일

```text
agent/dist/officeguard-agent.exe
```

---

## 7. Mini PC Agent 배치

Mini PC 최종 파일 구조

```text
D:\DEV\OfficeGuardLab\
├─ officeguard-agent.exe
├─ .env
└─ watch\
```

### 각 경로의 역할

| 경로                      | 역할              |
| ----------------------- | --------------- |
| `officeguard-agent.exe` | Agent 단일 실행 파일  |
| `.env`                  | Agent 환경 변수     |
| `watch\`                | 일반 파일 이벤트 감시 경로 

#### Mini PC에는 다음 개발 도구 설치 불필요

```text
Node.js
pnpm
TypeScript
프로젝트 의존성
```

Agent 빌드, Mini PC 전달, 환경 변수, Windows Event Log 설정은 [Mini PC Agent 문서](./agent.md) 참고

---

## 8. Mini PC Agent 실행 전 확인

### Main PC Health API 확인

Mini PC CMD에서 실행

```cmd
curl.exe http://<MAIN_PC_IP>:4000/health
```

#### 예상 응답

```json
{
  "status": "ok",
  "service": "officeguard-lab-backend"
}
```

### 확인 항목

* Main PC 서비스 실행 상태
* Main PC 내부 IPv4
* Backend Port
* Windows 방화벽
* Agent의 `AGENT_RECEIVER_URL`
* DNS Client Operational Log 활성화
* WFP Event ID `5156` 성공 감사 활성화
* Agent 관리자 권한 실행

---

## 9. Mini PC Agent 실행

Mini PC CMD에서 실행

```cmd
cd /d D:\DEV\OfficeGuardLab
officeguard-agent.exe
```

### 전체 경로 실행

```cmd
D:\DEV\OfficeGuardLab\officeguard-agent.exe
```

### Agent 실행 중 수집 이벤트

```text
DNS_QUERY
NETWORK_FLOW
PROCESS_START
FILE_CREATED
FILE_MODIFIED
FILE_DELETED
FILE_COPIED
USB_CONNECTED
USB_DISCONNECTED
PRINT_REQUESTED
```

### 실행 기준

* Agent 실행 중에만 이벤트 수집
* 사용자 직접 실행
* `Ctrl+C` 직접 종료
* 관리자 권한 실행
* WFP Event ID `5156` 성공 감사 활성화
* 수집 이벤트의 `SecurityEvent` 변환
* Main PC Event Receiver 내부망 전송

---

## 10. 실행 확인

### 최근 이벤트 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/events?limit=10"
```

### 최근 Rule Hit 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/rule-hits?limit=10"
```

### 특정 이벤트 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/events/<EVENT_ID>"
```

### 특정 Mini PC Source IP 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/events?sourceIp=<MINI_PC_IP>"
```

### 특정 Mini PC Device ID 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/events?deviceId=<AGENT_DEVICE_ID>"
```

### 특정 Severity Rule Hit 조회

```powershell
Invoke-RestMethod "http://localhost:4000/api/rule-hits?severity=HIGH"
```

조회 조건과 응답 구조는 [Storage 및 조회 API 문서](./storage-api.md) 참고

---

## 11. 로그 확인

### Backend 로그

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f backend
```

### Event Receiver 로그 필터

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f backend |
  findstr /I /C:"[event-receiver]"
```

### Dashboard 로그

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f dashboard
```

### Kafka 로그

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f kafka
```

### PostgreSQL 로그

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  logs -f postgres
```

---

## 12. 종료

### Mini PC Agent 종료

Agent 실행 CMD에서 입력

```text
Ctrl+C
```

### Main PC 서비스 종료

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  down
```

### Main PC 서비스와 Volume 삭제

```powershell
docker compose `
  --env-file .\infra\.env `
  -f .\infra\docker-compose.yml `
  down -v
```

> `down -v` 실행 시 PostgreSQL Volume 데이터 삭제
