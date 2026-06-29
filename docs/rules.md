# Rule-based Analyzer

## 1. 개요

Kafka Consumer 수신 이벤트의 Rule 조건 평가 및 `RULE_HIT` 생성

```text
Kafka Consumer 원본 이벤트
→ Rule-based Analyzer
→ Rule 조건 평가
→ RULE_HIT 생성
→ 기존 Kafka Topic 재발행
```

---

## 2. 처리 기준

* 마스킹 전 원본 이벤트 평가
* 이벤트 `timestamp` 기준 시간 범위 계산
* 동일 `deviceId` 또는 `sourceIp` 기준 이벤트 연결
* 조건 충족 시 별도 `RULE_HIT` 생성
* 원본 이벤트 변경 제외
* `RULE_HIT` 재분석 제외

```text
RULE_HIT 재수신
→ Analyzer 평가 제외
→ 재귀 생성 방지
```

---

## 3. Rule 목록

| Rule ID                              | 조건                               | Severity |
| ------------------------------------ | -------------------------------- | -------- |
| `LARGE_FILE_COPY_DETECTED`           | 파일 크기가 설정 임계값 이상인 `FILE_COPIED`  | `MEDIUM` |
| `USB_FILE_COPY_DETECTED`             | USB 연결 후 설정 시간 안에 파일 복사          | `HIGH`   |
| `FILE_COPY_EXTERNAL_DOMAIN_DETECTED` | 파일 복사 후 설정된 외부 도메인 조회            | `HIGH`   |
| `DNS_QUERY_SPIKE_DETECTED`           | 동일 Source IP의 DNS 요청량이 설정 임계값 이상 | `MEDIUM` |

---

## 4. 단일 이벤트 Rule

### LARGE_FILE_COPY_DETECTED

```text
FILE_COPIED
→ metadata.sizeBytes 확인
→ 설정 임계값 이상
→ LARGE_FILE_COPY_DETECTED
```

#### 평가 기준

```text
metadata.sizeBytes
>=
ANALYZER_LARGE_FILE_COPY_BYTES_THRESHOLD
```

> `sizeBytes`가 없는 이벤트의 탐지 제외

---

## 5. 연속 이벤트 Rule

### USB_FILE_COPY_DETECTED

```text
USB_CONNECTED
→ 동일 deviceId 또는 sourceIp
→ 설정 시간 안에 FILE_COPIED
→ USB_FILE_COPY_DETECTED
```

#### 시간 범위

```text
ANALYZER_USB_FILE_COPY_WINDOW_SECONDS
```

> 탐지에 사용된 최근 USB 연결 상태 제거 및 반복 탐지 제한

### FILE_COPY_EXTERNAL_DOMAIN_DETECTED

```text
FILE_COPIED
→ 동일 deviceId 또는 sourceIp
→ 설정 시간 안에 외부 대상 DNS_QUERY
→ FILE_COPY_EXTERNAL_DOMAIN_DETECTED
```

#### 시간 범위

```text
ANALYZER_FILE_COPY_EXTERNAL_DOMAIN_WINDOW_SECONDS
```

#### 외부 대상 도메인

```text
ANALYZER_EXTERNAL_DOMAINS
```

#### 도메인 비교 기준

* 소문자 변환
* 앞뒤 공백 제거
* 마지막 점 제거
* 등록 도메인 및 하위 도메인 일치
* 마스킹 전 원본 도메인 사용

---

## 6. 시간 범위 Rule

### DNS_QUERY_SPIKE_DETECTED

```text
동일 sourceIp의 DNS_QUERY 집계
→ 설정 시간 범위 적용
→ 설정 임계값 이상
→ DNS_QUERY_SPIKE_DETECTED
```

#### 집계 시간

```text
ANALYZER_DNS_SPIKE_WINDOW_SECONDS
```

#### 요청량 기준

```text
ANALYZER_DNS_SPIKE_THRESHOLD
```

> 탐지 후 동일 `sourceIp`의 반복 Rule Hit 제한

---

## 7. Rule Hit 구조

```json
{
  "eventId": "RULE_HIT_EVENT_ID",
  "eventType": "RULE_HIT",
  "timestamp": "2026-06-30T00:00:00.000Z",
  "sourceIp": "SOURCE_IP",
  "deviceId": "mini-pc-01",
  "severity": "HIGH",
  "message": "파일 복사 후 외부 전송 대상 도메인 조회가 발생했습니다.",
  "metadata": {
    "ruleId": "FILE_COPY_EXTERNAL_DOMAIN_DETECTED",
    "relatedEventIds": [
      "FILE_EVENT_ID",
      "DNS_EVENT_ID"
    ],
    "windowSeconds": 30
  }
}
```

### 주요 필드

| 필드                | 역할                |
| ----------------- | ----------------- |
| `severity`        | Rule 위험도          |
| `ruleId`          | 탐지 Rule 식별값       |
| `relatedEventIds` | 탐지 근거 이벤트 ID      |
| `windowSeconds`   | 연속 또는 집계 탐지 시간 범위 |

---

## 8. 상태 관리

프로세스 메모리 기반 최근 이벤트 상태 관리

```text
- 최근 USB_CONNECTED
- 최근 FILE_COPIED
- sourceIp별 최근 DNS_QUERY
- sourceIp별 마지막 DNS Spike 탐지 시각
```

#### 관리 기준

* 탐지 시간 범위 초과 상태 제거
* 탐지에 사용된 연속 이벤트 상태 제거
* DNS Spike 재탐지 대기 시간 적용
* Backend 재시작 시 전체 상태 초기화
* PostgreSQL 및 Redis 상태 저장 제외

---

## 9. Privacy 처리 관계

```text
Kafka Consumer 원본 이벤트
├─ Rule-based Analyzer 평가
└─ 보호 사본 생성
   ├─ Source IP 익명화
   └─ 민감 도메인 마스킹
```

* Analyzer의 원본 `sourceIp` 사용
* Analyzer의 원본 도메인 사용
* PostgreSQL 및 WebSocket용 보호 사본과 분리
* 도메인 마스킹 활성화 상태에서도 기존 Rule 평가 유지

---

## 10. 시연 제외 Rule

`USB_FILE_COPY_DETECTED` 구현 유지

### Phase 12 시연 범위 제외 사유

```text
재현 가능한 런타임 검증 방법 부재
```

### 적용 기준

* Rule 구현 삭제 제외
* Rule 조건 변경 제외
* Severity 변경 제외
* Analyzer 처리 흐름 유지
* 시연 및 완료 기준의 런타임 검증만 제외
