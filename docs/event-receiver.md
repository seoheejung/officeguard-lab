# Main PC Event Receiver

## 1. 개요

Mini PC Agent가 전송한 `SecurityEvent` 수신 및 검증

```text
Mini PC Agent
→ HTTP 요청 전송
→ Event Receiver 검증
→ Kafka Topic 발행
```

---

## 2. Endpoint

```http
POST /api/agent/events
```

### 내부망 요청 주소

```text
http://<MAIN_PC_IP>:4000/api/agent/events
```

### Mini PC Agent 환경 변수

```text
AGENT_RECEIVER_URL=http://<MAIN_PC_IP>:4000/api/agent/events
```

---

## 3. 처리 대상

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

`EMAIL_ATTACHMENT_SENT` 처리 제외

---

## 4. 처리 흐름

```text
HTTP JSON 요청 수신
→ eventType 확인
→ 이벤트 타입별 Validator 선택
→ 공통 필드 검증
→ metadata 검증
→ 검증된 필드로 SecurityEvent 재구성
→ Kafka Producer 전달
→ HTTP 202 응답
```

### 검증 기준

* JSON Object 여부 확인
* `eventType` 지원 여부 확인
* 공통 필드 형식 확인
* 이벤트별 필수 필드 확인
* 이벤트별 `metadata` 구조 확인
* 검증되지 않은 추가 값 전달 방지
* 검증 실패 이벤트의 Kafka 발행 차단

> `request.body`의 단순 타입 변환 후 Kafka 전달 방식 제외

```typescript
// 사용 제외
const event = request.body as SecurityEvent;
```

---

## 5. 이벤트별 Validator

```text
DNS_QUERY
→ DNS Query Validator

NETWORK_FLOW
→ Network Flow Validator

Process / File / USB / Print Event
→ Endpoint Event Validator
```

### 공통 필드

```text
eventId
eventType
timestamp
sourceIp
deviceId
userAlias
message
metadata
```

### DNS Query 검증

```text
sourceIp
metadata.domain
metadata.queryType
metadata.action
metadata.responseCode
```

### Network Flow 검증

```text
sourceIp
metadata.destinationIp
metadata.destinationPort
metadata.protocol
```

#### 선택 필드

```text
metadata.domain
metadata.bytesIn
metadata.bytesOut
```

### Endpoint Event 검증

```text
deviceId
eventType별 metadata 필수 필드
```

---

## 6. 정상 응답

### HTTP Status

```text
202 Accepted
```

### 응답

```json
{
  "status": "accepted",
  "eventId": "EVENT_UUID"
}
```

### 처리 결과

```text
이벤트 검증 완료
→ Kafka Producer 전달 완료
→ Event Receiver 처리 종료
```

---

## 7. 검증 실패

### HTTP Status

```text
400 Bad Request
```

### 응답 예시

```json
{
  "error": "invalid_endpoint_event",
  "message": "..."
}
```

### 오류 코드

```text
invalid_dns_query
invalid_network_flow
invalid_endpoint_event
```

### 처리 결과

```text
이벤트 검증 실패
→ Kafka 발행 제외
→ 오류 응답 반환
```

---

## 8. Kafka 발행 실패

### HTTP Status

```text
500 Internal Server Error
```

### 응답

```json
{
  "error": "event_publish_failed"
}
```

### 처리 결과

```text
이벤트 검증 완료
→ Kafka Producer 전달 실패
→ 오류 로그 기록
→ HTTP 500 응답
```

---

## 9. 요청 예시

```json
{
  "eventId": "EVENT_UUID",
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

## 10. 책임 범위

### Event Receiver 수행 작업

```text
- Mini PC Agent 이벤트 수신
- 이벤트 타입 확인
- 공통 필드 검증
- metadata 검증
- SecurityEvent 재구성
- Kafka Topic 발행
- HTTP 응답 반환
```

### Event Receiver 직접 처리 제외

```text
- PostgreSQL 저장
- Rule-based Analyzer 평가
- RULE_HIT 생성
- Source IP 익명화
- 민감 도메인 마스킹
- WebSocket 전달
- Dashboard 갱신
```

#### 후속 처리

```text
Event Receiver
→ Kafka Topic
→ Kafka Consumer
   ├─ Rule-based Analyzer
   └─ Privacy Protector
      ├─ PostgreSQL
      └─ WebSocket
```

---

## 11. 전송 경계

```text
Mini PC Agent
→ 내부망 HTTP 전송
→ Main PC Event Receiver
```

* 내부망 기반 이벤트 전송
* 외부 클라우드 서버 전송 제외
* 패킷 Payload 전송 제외
* HTTPS 본문 전송 제외
* 파일 본문 전송 제외
* 계정 정보 및 인증 Token 전송 제외
