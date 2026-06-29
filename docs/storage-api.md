# Storage 및 조회 API

## 1. 개요

PostgreSQL 기반 `SecurityEvent` 및 `RULE_HIT` 저장과 REST API 조회

```text
Kafka Consumer
→ 보호 사본 생성
→ PostgreSQL 저장
→ REST API 조회
```

---

## 2. 저장 구조

모든 이벤트의 단일 `security_events` 테이블 저장

### 주요 Column

| Column        | 역할                      |
| ------------- | ----------------------- |
| `event_id`    | 이벤트 고유 ID 및 Primary Key |
| `event_type`  | 이벤트 타입                  |
| `occurred_at` | 이벤트 발생 시각               |
| `stored_at`   | PostgreSQL 저장 시각        |
| `source_ip`   | 원본 또는 익명화된 Source IP    |
| `device_id`   | Mini PC Agent 식별값       |
| `user_alias`  | 사용자 별칭                  |
| `severity`    | Rule Hit 위험도            |
| `message`     | 이벤트 설명                  |
| `rule_id`     | Rule 식별값                |
| `metadata`    | 이벤트별 세부 데이터             |

```text
event_id
event_type
occurred_at
stored_at
source_ip
device_id
user_alias
severity
message
rule_id
metadata
```

### 저장 기준

* `eventId` 기준 중복 저장 방지
* 이벤트 발생 시각과 저장 시각 분리
* Privacy 보호 설정 적용 사본 저장
* 원본 이벤트 객체 변경 제외
* 이벤트별 `metadata` JSONB 저장
* `RULE_HIT` 동일 테이블 저장
* Rule Hit의 `ruleId` 별도 Column 저장

---

## 3. 이벤트 목록 조회

```http
GET /api/events
```

### Query Parameter

| Parameter   | 역할        |
| ----------- | --------- |
| `limit`     | 조회 개수     |
| `eventType` | 이벤트 타입    |
| `sourceIp`  | Source IP |
| `deviceId`  | Device ID |
| `from`      | 조회 시작 시각  |
| `to`        | 조회 종료 시각  |

### 조회 예시

#### 최근 이벤트 20건

```powershell
curl.exe "http://localhost:4000/api/events?limit=20"
```

#### 최근 DNS Query 10건

```powershell
curl.exe "http://localhost:4000/api/events?eventType=DNS_QUERY&limit=10"
```

#### 특정 Mini PC 이벤트

```powershell
curl.exe "http://localhost:4000/api/events?deviceId=mini-pc-01"
```

#### 시간 범위 조회

```powershell
curl.exe "http://localhost:4000/api/events?from=2026-06-30T00:00:00.000Z&to=2026-06-30T23:59:59.999Z"
```

---

## 4. 이벤트 단건 조회

```http
GET /api/events/:eventId
```

### 조회 예시

```powershell
curl.exe "http://localhost:4000/api/events/<EVENT_ID>"
```

### 조회 기준

```text
event_id
→ 단일 SecurityEvent 조회
```

---

## 5. Rule Hit 조회

```http
GET /api/rule-hits
```

### Query Parameter

| Parameter  | 역할        |
| ---------- | --------- |
| `limit`    | 조회 개수     |
| `severity` | Severity  |
| `ruleId`   | Rule ID   |
| `sourceIp` | Source IP |
| `deviceId` | Device ID |
| `from`     | 조회 시작 시각  |
| `to`       | 조회 종료 시각  |

### 조회 예시

#### HIGH Severity 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?severity=HIGH"
```

#### DNS Spike Rule 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?ruleId=DNS_QUERY_SPIKE_DETECTED"
```

#### 특정 Mini PC Rule Hit 조회

```powershell
curl.exe "http://localhost:4000/api/rule-hits?deviceId=mini-pc-01"
```

---

## 6. 조회 제한

```text
기본 조회 개수: 50
최대 조회 개수: 100
정렬: occurred_at DESC, event_id DESC
```

* 최신 이벤트 우선 정렬
* 동일 발생 시각의 `event_id` 기준 정렬
* 최대 조회 개수 초과 제한

---

## 7. 목록 응답 구조

```json
{
  "count": 1,
  "items": [
    {
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
      },
      "storedAt": "2026-06-30T00:00:01.000Z"
    }
  ]
}
```

### 응답 필드

| 필드          | 역할               |
| ----------- | ---------------- |
| `count`     | 반환된 이벤트 수        |
| `items`     | 조회 이벤트 목록        |
| `timestamp` | 이벤트 발생 시각        |
| `storedAt`  | PostgreSQL 저장 시각 |

> Privacy 설정 활성화 시 보호된 `sourceIp`, `domain`, `message` 반환

---

## 8. Source IP 필터와 익명화

Source IP 익명화 활성화 상태에서도 원본 IP 기반 조회 지원

```http
GET /api/events?sourceIp=<MINI_PC_IP>
```

### 처리 흐름

```text
원본 Source IP Query Parameter
→ 동일 HMAC-SHA256 익명화 적용
→ 익명 식별자 기준 PostgreSQL 조회
```

### 익명 식별자 직접 조회 지원

```http
GET /api/events?sourceIp=anon-ip-...
```

### Rule Hit 조회 동일 적용

```http
GET /api/rule-hits?sourceIp=<MINI_PC_IP>
```

```http
GET /api/rule-hits?sourceIp=anon-ip-...
```

---

## 9. 조회 API 접근 로그

### 기록 대상

```text
GET /api/events
GET /api/events/:eventId
GET /api/rule-hits
```

### 기록 항목

| 항목            | 역할               |
| ------------- | ---------------- |
| `requestedAt` | 요청 시각            |
| `method`      | HTTP Method      |
| `path`        | 요청 경로            |
| `status`      | 응답 Status        |
| `durationMs`  | 요청 처리 시간         |
| `clientIp`    | 보호 처리된 Client IP |

```text
requestedAt
method
path
status
durationMs
clientIp
```

### 기록 제외

```text
Query String
Query Parameter 값
응답 Body
```

* 조회 조건 로그 제외
* 조회 결과 로그 제외
* 민감 데이터 노출 방지
* Client IP 보호 처리

---

## 10. 저장 및 조회 흐름

```text
Kafka Consumer
→ Privacy Protector
→ 보호 사본 생성
→ security_events 저장
→ REST API 조회
→ Realtime Dashboard 초기 데이터 제공
```

### 역할 구분

| 구성 요소              | 역할                      |
| ------------------ | ----------------------- |
| Kafka Consumer     | 이벤트 수신                  |
| Privacy Protector  | Source IP 익명화 및 도메인 마스킹 |
| PostgreSQL         | 이벤트 영구 저장               |
| REST API           | 저장 이벤트 조회               |
| Realtime Dashboard | 최근 이벤트 초기 표시            |

---

## 11. 보관 기간

`stored_at` 기준 만료 이벤트 정리

```text
현재 시각
→ PRIVACY_EVENT_RETENTION_DAYS 차감
→ stored_at 기준 만료 이벤트 삭제
```

### 정리 시점

* Backend 시작 시 즉시 정리
* 설정 주기 기반 반복 정리
* PostgreSQL 이벤트 대상 정리
* Kafka Message Retention과 별도 관리
