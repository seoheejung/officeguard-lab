# WebSocket

## 1. 개요

신규 `SecurityEvent`의 Realtime Dashboard 전달

```text
Kafka Consumer
→ 보호 사본 생성
→ PostgreSQL 저장
→ WebSocket 전달
→ Realtime Dashboard
```

---

## 2. Endpoint

### 로컬 주소

```text
ws://localhost:4000/ws
```

### Main PC 내부망 주소

```text
ws://<MAIN_PC_IP>:4000/ws
```

### 연결 기준

* Express HTTP 서버와 동일 Port 사용
* 별도 WebSocket Port 미사용
* `/ws` 경로 사용

---

## 3. 메시지 구조

```json
{
  "type": "SECURITY_EVENT",
  "payload": {
    "eventId": "EVENT_UUID",
    "eventType": "DNS_QUERY",
    "timestamp": "2026-06-30T00:00:00.000Z",
    "sourceIp": "anon-ip-...",
    "deviceId": "mini-pc-01",
    "message": "github.com DNS 조회가 완료되었습니다.",
    "metadata": {
      "domain": "github.com",
      "queryType": "A",
      "action": "ALLOW",
      "responseCode": "NOERROR"
    }
  }
}
```

### 메시지 필드

| 필드        | 역할                       |
| --------- | ------------------------ |
| `type`    | WebSocket 메시지 종류         |
| `payload` | 보호 설정 적용 `SecurityEvent` |

#### 현재 메시지 Type

```text
SECURITY_EVENT
```

---

## 4. RULE_HIT 전달

`RULE_HIT`의 동일 WebSocket Type 사용

```json
{
  "type": "SECURITY_EVENT",
  "payload": {
    "eventType": "RULE_HIT"
  }
}
```

> 별도 `RULE_HIT` WebSocket Type 미사용

---

## 5. 전달 기준

```text
Kafka Consumer 수신
→ 보호 사본 생성
→ PostgreSQL 저장 시도
→ 신규 저장 성공
→ WebSocket 전달
```

### 전달 조건

* Privacy 보호 설정 적용 사본 사용
* PostgreSQL 신규 저장 이벤트만 전달
* `eventId` 중복 이벤트 재전달 제외
* 저장 실패 이벤트 전달 제외

---

## 6. Dashboard 데이터 구성

```text
Dashboard 접속
├─ REST API 기반 최근 이벤트 조회
└─ WebSocket 기반 신규 이벤트 수신
```

### 초기 조회

```text
GET /api/events?limit=50
GET /api/events?eventType=DNS_QUERY&limit=50
GET /api/rule-hits?limit=50
```

### 신규 이벤트

```text
WebSocket /ws
```

### 중복 처리

```text
REST API 이벤트
+
WebSocket 이벤트
→ eventId 기준 병합
→ 중복 제거
```

---

## 7. 연결 상태

### Dashboard 표시 상태

```text
CONNECTING
CONNECTED
DISCONNECTED
ERROR
```

* 연결 시 `CONNECTED` 표시
* 연결 종료 시 `DISCONNECTED` 표시
* 연결 오류 시 `ERROR` 표시
* Dashboard 새로고침 시 신규 연결

---

## 8. 현재 구현 범위

* Client 연결 감지
* Client 연결 종료 감지
* 신규 `SecurityEvent` 전달
* 연결 가능한 Client 대상 Broadcast
* Client별 전송 오류 격리
* Dashboard 연결 상태 표시
* 보호 데이터 전달

---

## 9. 제외 범위

* WebSocket 인증
* 자동 재연결
* Heartbeat
* 연결 복구
* 메시지 재전송 보장
* 전달 순서 보장 기능 추가
* 별도 WebSocket Broker
* Client별 이벤트 필터링
* 과거 이벤트 WebSocket 재전송
