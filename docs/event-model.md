# 이벤트 모델

## 1. 개요

OfficeGuard Lab의 공통 `SecurityEvent` 구조와 이벤트별 `metadata` 정의

```text
Mini PC Agent 수집
→ SecurityEvent 정규화
→ Main PC Event Receiver 검증
→ Kafka 발행
→ 분석·저장·전달
```

---

## 2. 공통 필드

| 필드          | 역할                    |
| ----------- | --------------------- |
| `eventId`   | 이벤트 고유 UUID           |
| `eventType` | 이벤트 종류                |
| `timestamp` | ISO 8601 이벤트 발생 시각    |
| `sourceIp`  | 이벤트 발생 Source IP      |
| `deviceId`  | Mini PC Agent 식별값     |
| `userAlias` | 사용자 실명 대신 사용하는 별칭     |
| `severity`  | Rule Hit 위험도          |
| `message`   | 로그 및 Dashboard 표시 메시지 |
| `metadata`  | 이벤트 타입별 세부 정보         |

### 필드 적용 기준

* 모든 이벤트의 `eventId`, `eventType`, `timestamp`, `message`, `metadata` 사용
* DNS 및 Network Flow 이벤트의 `sourceIp` 사용
* Endpoint 이벤트의 `deviceId` 사용
* 수집 가능한 경우 `userAlias` 사용
* `RULE_HIT` 이벤트의 `severity` 필수 사용
* 이벤트 타입별 별도 `metadata` 구조 사용

---

## 3. 전체 이벤트 타입

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
RULE_HIT
```

### 이벤트 구분

```text
Network Event
├─ DNS_QUERY
└─ NETWORK_FLOW

Endpoint Event
├─ PROCESS_START
├─ FILE_CREATED
├─ FILE_MODIFIED
├─ FILE_DELETED
├─ FILE_COPIED
├─ USB_CONNECTED
├─ USB_DISCONNECTED
└─ PRINT_REQUESTED

Analyzer Event
└─ RULE_HIT
```

---

## 4. DNS_QUERY

Mini PC의 DNS 요청 기록을 정규화한 이벤트

### Metadata

| 필드             | 역할             |
| -------------- | -------------- |
| `domain`       | 조회 대상 도메인      |
| `queryType`    | DNS Query Type |
| `action`       | 요청 처리 결과       |
| `responseCode` | DNS 응답 코드      |

```text
domain
queryType
action
responseCode
```

### 예시

```json
{
  "eventId": "DNS_EVENT_UUID",
  "eventType": "DNS_QUERY",
  "timestamp": "2026-06-30T00:00:00.000Z",
  "sourceIp": "172.30.1.67",
  "deviceId": "mini-pc-01",
  "userAlias": "user-001",
  "message": "github.com DNS 조회가 완료되었습니다.",
  "metadata": {
    "domain": "github.com",
    "queryType": "A",
    "action": "ALLOW",
    "responseCode": "NOERROR"
  }
}
```

---

## 5. NETWORK_FLOW

Mini PC의 TCP 또는 UDP 발신 연결 메타데이터를 정규화한 이벤트

### 필수 Metadata

| 필드                | 역할             |
| ----------------- | -------------- |
| `destinationIp`   | 연결 대상 IP       |
| `destinationPort` | 연결 대상 Port     |
| `protocol`        | `TCP` 또는 `UDP` |

```text
destinationIp
destinationPort
protocol
```

### 선택 Metadata

| 필드         | 역할           |
| ---------- | ------------ |
| `domain`   | 목적지와 연결된 도메인 |
| `bytesIn`  | 수신 Byte 수    |
| `bytesOut` | 송신 Byte 수    |

```text
domain
bytesIn
bytesOut
```

### 수집 기준

* Windows Filtering Platform Event ID `5156` 기반 수집
* 확인 가능한 연결 메타데이터만 반영
* 확인 불가능한 도메인 값 생성 제외
* `bytesIn`, `bytesOut` 임의 생성 제외
* 패킷 Payload 및 HTTPS 본문 제외

WFP Event ID `5156`에서 Byte 수를 제공하지 않는 경우 `bytesIn`, `bytesOut` 생략

### 예시

```json
{
  "eventId": "NETWORK_EVENT_UUID",
  "eventType": "NETWORK_FLOW",
  "timestamp": "2026-06-30T00:00:00.000Z",
  "sourceIp": "172.30.1.67",
  "deviceId": "mini-pc-01",
  "userAlias": "user-001",
  "message": "TCP 연결이 관측되었습니다.",
  "metadata": {
    "destinationIp": "203.0.113.10",
    "destinationPort": 443,
    "protocol": "TCP"
  }
}
```

---

## 6. PROCESS_START

Mini PC의 실제 프로세스 실행 이벤트

### Metadata

| 필드                | 역할         |
| ----------------- | ---------- |
| `processName`     | 실행 프로세스 이름 |
| `processId`       | 프로세스 ID    |
| `parentProcessId` | 부모 프로세스 ID |
| `executablePath`  | 실행 파일 경로   |

```text
processName
processId
parentProcessId
executablePath
```

> 수집 가능한 필드만 반영

---

## 7. FILE_CREATED / FILE_MODIFIED / FILE_DELETED

Agent 감시 경로의 파일 생성·수정·삭제 이벤트

### Metadata

| 필드          | 역할       |
| ----------- | -------- |
| `path`      | 대상 파일 경로 |
| `sizeBytes` | 파일 크기    |
| `extension` | 파일 확장자   |

```text
path
sizeBytes
extension
```

### 수집 기준

* `AGENT_FILE_WATCH_PATH` 기준 감시
* 파일 생성 시 `FILE_CREATED`
* 파일 수정 시 `FILE_MODIFIED`
* 파일 삭제 시 `FILE_DELETED`
* 파일 본문 수집 제외
* 확인 불가능한 파일 크기 임의 작성 제외

---

## 8. FILE_COPIED

감시 경로의 파일을 USB 저장 장치로 복사한 경우 생성되는 이벤트

### Metadata

| 필드                | 역할               |
| ----------------- | ---------------- |
| `sourcePath`      | 원본 파일 경로         |
| `destinationPath` | USB 저장 장치의 대상 경로 |
| `sizeBytes`       | 복사 파일 크기         |

```text
sourcePath
destinationPath
sizeBytes
```

### 생성 기준

```text
AGENT_FILE_WATCH_PATH 원본 파일
→ USB 저장 장치 대상 파일 생성 또는 수정 감지
→ 원본 파일 확인
→ FILE_COPIED 생성
```

* 원본 파일 확인 가능한 경우에만 생성
* 일반 파일 이동 전체를 복사 이벤트로 간주하지 않음
* 파일 본문 수집 제외

### 예시

```json
{
  "eventId": "FILE_EVENT_UUID",
  "eventType": "FILE_COPIED",
  "timestamp": "2026-06-30T00:00:00.000Z",
  "sourceIp": "172.30.1.67",
  "deviceId": "mini-pc-01",
  "userAlias": "user-001",
  "message": "USB 저장 장치로 파일이 복사되었습니다.",
  "metadata": {
    "sourcePath": "D:\\DEV\\OfficeGuardLab\\watch\\sample.bin",
    "destinationPath": "E:\\sample.bin",
    "sizeBytes": 1048576
  }
}
```

---

## 9. USB_CONNECTED / USB_DISCONNECTED

USB 저장 장치 연결 및 해제 이벤트

### Metadata

| 필드            | 역할                          |
| ------------- | --------------------------- |
| `vendor`      | 장치 제조사                      |
| `productName` | 장치 제품명                      |
| `serialAlias` | 원본 Serial Number 대신 사용하는 별칭 |

```text
vendor
productName
serialAlias
```

### 수집 기준

* USB 저장 장치 연결 시 `USB_CONNECTED`
* USB 저장 장치 해제 시 `USB_DISCONNECTED`
* 원본 USB Serial Number 저장 제외
* 마스킹 또는 별칭 처리된 값 사용

---

## 10. PRINT_REQUESTED

Mini PC의 실제 Print Job 이벤트

### Metadata

| 필드              | 역할                |
| --------------- | ----------------- |
| `printerName`   | 대상 Printer 이름     |
| `documentAlias` | 실제 문서명 대신 사용하는 별칭 |
| `pageCount`     | 인쇄 Page 수         |

```text
printerName
documentAlias
pageCount
```

### 수집 기준

* 실제 Print Job 발생 시 생성
* 실제 문서명 저장 제외
* 확인 가능한 Page 수만 반영
* 문서 본문 수집 제외

---

## 11. RULE_HIT

Rule-based Analyzer의 탐지 결과 이벤트

### 공통 필드

```text
severity
sourceIp
deviceId
userAlias
```

### Metadata

| 필드                | 역할                |
| ----------------- | ----------------- |
| `ruleId`          | 탐지 Rule 식별값       |
| `relatedEventIds` | 탐지 근거 원본 이벤트 ID   |
| `windowSeconds`   | 연속 또는 집계 탐지 시간 범위 |

```text
ruleId
relatedEventIds
windowSeconds
```

### 생성 기준

```text
원본 SecurityEvent
→ Rule 조건 평가
→ 조건 충족
→ RULE_HIT 생성
→ Kafka Topic 재발행
```

> `RULE_HIT`은 보안 사고 확정이 아닌 Rule 조건 충족 결과

### 예시

```json
{
  "eventId": "RULE_HIT_UUID",
  "eventType": "RULE_HIT",
  "timestamp": "2026-06-30T00:00:01.000Z",
  "sourceIp": "172.30.1.67",
  "deviceId": "mini-pc-01",
  "userAlias": "user-001",
  "severity": "HIGH",
  "message": "파일 복사 후 외부 전송 대상 도메인 조회가 발생했습니다.",
  "metadata": {
    "ruleId": "FILE_COPY_EXTERNAL_DOMAIN_DETECTED",
    "relatedEventIds": [
      "FILE_EVENT_UUID",
      "DNS_EVENT_UUID"
    ],
    "windowSeconds": 30
  }
}
```

---

## 12. 이벤트 정규화 기준

```text
Collector 원본 데이터
→ 필요한 필드 추출
→ eventId 생성
→ timestamp 생성
→ 공통 필드 구성
→ eventType별 metadata 구성
→ SecurityEvent 생성
```

### 공통 기준

* `crypto.randomUUID()` 기반 `eventId` 생성
* ISO 8601 형식 `timestamp` 생성
* JSON 직렬화 가능한 값 사용
* 이벤트별 필수 Metadata 구분
* 확인 불가능한 값의 임의 생성 제외
* 파일 본문 및 패킷 Payload 제외
* 사용자 실명 대신 `userAlias` 사용

---

## 13. Privacy 적용 기준

Kafka Consumer가 수신한 원본 이벤트와 보호 사본의 처리 흐름 분리

```text
원본 SecurityEvent
├─ Rule-based Analyzer 평가
└─ 보호 사본 생성
   ├─ Source IP 익명화
   └─ 민감 도메인 마스킹
      ├─ PostgreSQL 저장
      └─ WebSocket 전달
```

### 유지 필드

```text
eventId
eventType
timestamp
deviceId
severity
relatedEventIds
```

### 보호 대상

```text
sourceIp
metadata.domain
message 내부 민감 도메인
```

---

## 14. 구현 범위에서 제외된 이벤트

### EMAIL_ATTACHMENT_SENT

`EMAIL_ATTACHMENT_SENT`는 Phase 2 이벤트 모델 정의 이력에 포함된 이벤트

Phase 10 구현 과정에서 최종 수집 및 검증 범위 제외

### 제외 기능

```text
- 테스트 메일 전송
- 메일 첨부 이벤트 생성
- Agent 메일 전송 감지
- Event Receiver의 EMAIL_ATTACHMENT_SENT 처리
- EMAIL_ATTACHMENT_SENT 저장 및 Dashboard 표시 검증
- EMAIL_ATTACHMENT_SENT 시연 시나리오
```

### 범위 구분

```text
이벤트 모델 정의 이력 유지
≠
최종 수집 및 시연 기능
```

> 최종 Agent 수집 이벤트 목록과 시연 범위에는 `EMAIL_ATTACHMENT_SENT` 미포함
