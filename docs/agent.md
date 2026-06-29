# Mini PC Agent

## 1. 개요

Mini PC의 네트워크 및 단말 이벤트 수집, `SecurityEvent` 변환, Main PC Event Receiver 전송

```text
Mini PC 실제 행위
→ Agent 이벤트 수집
→ SecurityEvent 생성
→ Main PC 내부망 전송
```

---

## 2. 실행 방식

### 실행 파일

```text
officeguard-agent.exe
```

### 실행 원칙

* 사용자 직접 실행
* `Ctrl+C` 직접 종료
* 설치 과정 없음
* Node.js 설치 불필요
* pnpm 설치 불필요
* TypeScript 설치 불필요
* Windows Service 등록 없음
* 자동 시작 없음
* 은닉 실행 없음
* 제거 방지 없음

> Agent 실행 중에만 이벤트 수집

---

## 3. 파일 구조

```text
D:\DEV\OfficeGuardLab\
├─ officeguard-agent.exe
├─ .env
└─ watch\
```

### 각 파일 역할

| 경로                      | 역할              |
| ----------------------- | --------------- |
| `officeguard-agent.exe` | Agent 단일 실행 파일  |
| `.env`                  | Agent 실행 설정     |
| `watch\`                | 일반 파일 이벤트 감시 경로 |

> 실행 파일 경로 기준 `.env` 조회

---

## 4. 환경 변수

| 환경 변수                                | 역할                            |
| ------------------------------------ | ----------------------------- |
| `AGENT_RECEIVER_URL`                 | Main PC Event Receiver 전체 URL |
| `AGENT_DEVICE_ID`                    | Mini PC Agent 식별값             |
| `AGENT_USER_ALIAS`                   | 사용자 별칭                        |
| `AGENT_NETWORK_INTERFACE`            | Source IP 확인 대상 Interface     |
| `AGENT_REQUEST_TIMEOUT_MS`           | Receiver 요청 제한 시간             |
| `AGENT_FILE_WATCH_PATH`              | 일반 파일 이벤트 감시 경로               |
| `AGENT_FILE_EVENT_DEBOUNCE_MS`       | 동일 파일 이벤트 중복 제한 시간            |
| `AGENT_USB_COPY_SETTLE_INTERVAL_MS`  | USB 파일 상태 재확인 간격              |
| `AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS` | USB 파일 상태 최대 확인 횟수            |

### `.env.example`

```dotenv
AGENT_RECEIVER_URL=
AGENT_DEVICE_ID=
AGENT_USER_ALIAS=
AGENT_NETWORK_INTERFACE=
AGENT_REQUEST_TIMEOUT_MS=
AGENT_FILE_WATCH_PATH=
AGENT_FILE_EVENT_DEBOUNCE_MS=
AGENT_USB_COPY_SETTLE_INTERVAL_MS=
AGENT_USB_COPY_SETTLE_MAX_ATTEMPTS=
```

> 실제 IP, 사용자 정보, 실행값의 Git 저장 제외

---

## 5. Collector 구성

```text
Mini PC Agent
├─ DNS Collector
├─ Network Flow Collector
├─ Process Collector
├─ File Collector
├─ USB Collector
└─ Print Collector
```

### DNS Collector

```text
Microsoft-Windows-DNS-Client/Operational
→ Event ID 3008
→ DNS_QUERY
```

### 수집 항목

```text
sourceIp
domain
queryType
```

### Network Flow Collector

```text
Windows Security Log
→ WFP Event ID 5156
→ NETWORK_FLOW
```

### 수집 항목

```text
sourceIp
destinationIp
destinationPort
protocol
```

### 수집 제외

* 패킷 Payload
* HTTP 본문
* HTTPS 본문
* 확인 불가능한 Byte 수
* Agent의 Event Receiver 전송 연결

### Process Collector

```text
Win32_ProcessStartTrace
→ PROCESS_START
```

### File Collector

```text
FileSystemWatcher
├─ FILE_CREATED
├─ FILE_MODIFIED
└─ FILE_DELETED
```

### 감시 경로

```text
AGENT_FILE_WATCH_PATH
```

### USB Collector

```text
Win32_DeviceChangeEvent
Win32_DiskDrive
├─ USB_CONNECTED
├─ USB_DISCONNECTED
└─ FILE_COPIED
```

> 원본 USB Serial Number 저장 제외

### Print Collector

```text
Win32_PrintJob
→ PRINT_REQUESTED
```

> 실제 문서명 저장 제외

---

## 6. Agent 빌드

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

> 최종 생성 경로는 현재 `package.json`의 `build` 스크립트 결과 기준 확인

---

## 7. Mini PC 전달

### Main PC PowerShell에서 실행

```powershell
scp .\agent\dist\officeguard-agent.exe <MINI_PC_USER>@<MINI_PC_IP>:officeguard-agent.exe
```

### Mini PC 접속

```powershell
ssh <MINI_PC_USER>@<MINI_PC_IP>
```

### Agent 디렉터리 생성

```cmd
mkdir D:\DEV\OfficeGuardLab
```

### 실행 파일 이동 또는 교체

```cmd
move /Y officeguard-agent.exe D:\DEV\OfficeGuardLab\officeguard-agent.exe
```

### Mini PC 최종 배치

```text
D:\DEV\OfficeGuardLab\
├─ officeguard-agent.exe
├─ .env
└─ watch\
```

---

## 8. 실행 전 확인

### Main PC Health API 확인

```cmd
curl.exe http://<MAIN_PC_IP>:4000/health
```

### 예상 응답

```json
{
  "status": "ok",
  "service": "officeguard-lab-backend"
}
```

### 연결 실패 시 확인 항목

* Main PC 실행 상태
* Docker Compose 서비스 상태
* Main PC 내부 IP
* Backend Port
* Windows 방화벽
* `AGENT_RECEIVER_URL` 설정

---

## 9. Agent 실행

### Mini PC CMD에서 실행

```cmd
cd /d D:\DEV\OfficeGuardLab
officeguard-agent.exe
```

### 전체 경로 실행

```cmd
D:\DEV\OfficeGuardLab\officeguard-agent.exe
```

### 예상 로그

```text
[agent] OfficeGuard Mini PC Agent starting
[agent] deviceId=...
[agent] sourceIp=...
[agent] networkInterface=...
[agent] receiverDestination=...
[agent] fileWatchPath=...
[dns-collector] started
[network-flow-collector] started
[process-collector] started. source=Win32_ProcessStartTrace
[file-collector] started. watchPath=...
[usb-collector] started. source=Win32_DeviceChangeEvent initialDeviceCount=...
[print-collector] started. source=Win32_PrintJob
[agent] running. press Ctrl+C to stop
```

> Agent 실행 창 유지 필요

---

## 10. Agent 종료

### Agent 실행 CMD에서 입력

```text
Ctrl+C
```

### 예상 로그

```text
[agent] shutdown requested. signal=SIGINT
[agent] stopped
```

---

## 11. DNS Log 준비

### 관리자 권한 CMD에서 상태 확인

```cmd
wevtutil gl "Microsoft-Windows-DNS-Client/Operational"
```

### 필요 시 활성화

```cmd
wevtutil sl "Microsoft-Windows-DNS-Client/Operational" /e:true
```

### DNS 요청 발생

```cmd
ipconfig /flushdns
nslookup -type=A github.com
```

### 확인 이벤트

```text
DNS_QUERY
```

---

## 12. Network Flow Audit 준비

### 관리자 권한 CMD에서 상태 확인

```cmd
auditpol.exe /get /subcategory:"{0CCE9226-69AE-11D9-BED3-505054503030}"
```

### 필요 시 성공 감사 활성화

```cmd
auditpol.exe /set /subcategory:"{0CCE9226-69AE-11D9-BED3-505054503030}" /success:enable
```

### TCP 연결 발생

```powershell
Test-NetConnection example.com -Port 443
```

### 확인 이벤트

```text
NETWORK_FLOW
```

> WFP Event ID `5156` 수집을 위한 관리자 권한 실행 필요

---

## 13. Endpoint Event 확인

### 프로세스 실행

```powershell
notepad.exe
```

#### 확인 이벤트

```text
PROCESS_START
```

### 파일 생성

```powershell
Set-Content `
  -Path D:\DEV\OfficeGuardLab\watch\sample.txt `
  -Value 'test'
```

#### 확인 이벤트

```text
FILE_CREATED
```

### 파일 수정

```powershell
Add-Content `
  -Path D:\DEV\OfficeGuardLab\watch\sample.txt `
  -Value 'modified'
```

#### 확인 이벤트

```text
FILE_MODIFIED
```

### 파일 삭제

```powershell
Remove-Item D:\DEV\OfficeGuardLab\watch\sample.txt
```

#### 확인 이벤트

```text
FILE_DELETED
```

### USB 연결 및 해제

```text
USB 저장 장치 연결
→ USB_CONNECTED

USB 저장 장치 해제
→ USB_DISCONNECTED
```

### USB 파일 복사

```text
AGENT_FILE_WATCH_PATH 파일
→ USB 저장 장치로 복사
→ FILE_COPIED
```

> 원본 파일 확인 가능한 경우에만 `FILE_COPIED` 생성

### 프린트 요청

```text
테스트 문서 열기
→ Microsoft Print to PDF 선택
→ 인쇄 실행
→ PRINT_REQUESTED 확인
```

---

## 14. 이벤트 전송

```text
Collector 이벤트 수집
→ SecurityEvent 정규화
→ HTTP POST
→ Main PC Event Receiver
```

### 전송 Endpoint

```text
POST http://<MAIN_PC_IP>:4000/api/agent/events
```

### Agent 로그

```text
[agent] <EVENT_TYPE> collected. eventId=...
[agent] <EVENT_TYPE> sent. eventId=...
```

전송 실패 시 오류 로그 출력 및 해당 이벤트 전송 실패 처리

---

## 15. 수집 범위

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

### 수집 제외

* 패킷 Payload
* HTTPS 본문
* 파일 본문
* 사용자 비밀번호
* Cookie
* 인증 Token
* 키보드 입력
* 화면 캡처
* 실제 USB Serial Number
* 실제 Print Document Name
* `EMAIL_ATTACHMENT_SENT`
