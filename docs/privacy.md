# 보안 및 Privacy Boundary

## 1. 프로젝트 사용 범위

* 허가된 홈랩 환경
* 본인이 관리하는 Main PC와 Mini PC
* 보안 이벤트 수집 구조 학습
* 중앙 저장·분석·시각화 실험
* 타인 단말 대상 사용 제외
* 타인 네트워크 대상 사용 제외
* 실제 회사망 대상 사용 제외

---

## 2. 수집 데이터

```text
DNS Query Metadata
Source IP
Destination IP
Destination Port
Protocol
Event Timestamp
Process Metadata
File Event Metadata
USB Event Metadata
Print Request Metadata
Rule Hit Result
```

> Metadata 중심 수집 및 이벤트 본문 수집 제외

---

## 3. 수집 제외 데이터

```text
패킷 Payload
HTTPS 본문
비밀번호
Cookie
인증 Token
개인 메신저 내용
파일 본문
키보드 입력
화면 캡처
원본 USB Serial Number
실제 Print Document Name
```

---

## 4. Privacy 처리 경계

```text
Kafka Consumer 원본 이벤트
├─ Rule-based Analyzer 평가
└─ 보호 사본 생성
   ├─ Source IP 익명화
   └─ 민감 도메인 마스킹
      ├─ PostgreSQL 저장
      └─ WebSocket 전달
```

### 원본 이벤트 사용 범위

* Event Receiver 검증
* Kafka Topic 발행
* Kafka Consumer 수신
* Rule-based Analyzer 평가

### 보호 사본 사용 범위

* PostgreSQL 저장
* REST API 응답
* WebSocket 전달
* Realtime Dashboard 표시

---

## 5. Source IP 익명화

```text
Source IP 정규화
→ HMAC-SHA256 적용
→ 결과 앞 24자리 사용
→ anon-ip- 접두사 적용
```

### 변환 예시

```text
192.168.0.10
→ anon-ip-0123456789abcdef01234567
```

#### 적용 기준

* 동일 Source IP의 동일 익명 식별자 생성
* 동일 익명화 Key 사용 시 재시작 후 동일 결과 유지
* 원본 IP와 익명 식별자의 Mapping Table 미생성
* 역변환 기능 미제공
* 실제 Key의 Git 저장 제외
* `infra/.env` 기반 Key 관리

#### 생성하지 않는 구조

```text
원본 IP ↔ 익명 식별자
```

---

## 6. 민감 도메인 마스킹

등록 도메인과 하위 도메인의 동일 마스킹 처리

### 등록 예시

```text
example.com
mail.example.com
upload.example.com
```

### 마스킹 결과

```text
[masked-domain]
```

### 적용 대상

```text
DNS_QUERY metadata.domain
NETWORK_FLOW metadata.domain
DNS_QUERY message
NETWORK_FLOW message
```

### 도메인 일치 기준

```text
example.com
*.example.com
```

* 등록 도메인 일치
* 하위 도메인 일치
* 대소문자 차이 무시
* 마스킹 후 원본 도메인 저장 제외
* Analyzer의 마스킹 전 원본 이벤트 사용

---

## 7. 이벤트 보관 기간

```text
PostgreSQL stored_at
→ 현재 시각과 비교
→ 설정 보관 기간 초과
→ 만료 이벤트 삭제
```

### 정리 시점

* Backend 시작 시 즉시 정리
* Backend 실행 중 설정 주기 기반 반복 정리
* `stored_at` 기준 만료 판단
* `timestamp` 기준 삭제 제외

### 환경 변수

```text
PRIVACY_EVENT_RETENTION_DAYS
PRIVACY_RETENTION_CLEANUP_INTERVAL_MS
```

> Kafka Message Retention과 PostgreSQL 보관 정책의 별도 관리

---

## 8. 환경 변수

| 환경 변수                                     | 역할                   |
| ----------------------------------------- | -------------------- |
| `PRIVACY_SOURCE_IP_ANONYMIZATION_ENABLED` | Source IP 익명화 활성화 여부 |
| `PRIVACY_SOURCE_IP_ANONYMIZATION_KEY`     | HMAC-SHA256 익명화 Key  |
| `PRIVACY_DOMAIN_MASKING_ENABLED`          | 민감 도메인 마스킹 활성화 여부    |
| `PRIVACY_SENSITIVE_DOMAINS`               | 쉼표 구분 민감 도메인 목록      |
| `PRIVACY_EVENT_RETENTION_DAYS`            | 이벤트 보관 일수            |
| `PRIVACY_RETENTION_CLEANUP_INTERVAL_MS`   | 만료 이벤트 정리 주기         |

### 설정 기준

* Boolean 값의 `true`, `false` 형식 사용
* Source IP 익명화 활성화 시 익명화 Key 필수
* 익명화 Key 최소 길이 검증
* 도메인 마스킹 활성화 시 민감 도메인 목록 필수
* 실제 Key와 도메인 목록의 Git 저장 제외

---

## 9. 조회 API 접근 로그

### 기록 대상

```text
GET /api/events
GET /api/events/:eventId
GET /api/rule-hits
```

### 기록 항목

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

> Client IP의 동일 Privacy 보호 처리

---

## 10. Agent 실행 Boundary

```text
사용자 직접 실행
→ 이벤트 수집 시작

Ctrl+C 직접 종료
→ 이벤트 수집 종료
```

### 적용 기준

* 설치 과정 없음
* Windows Service 등록 없음
* 자동 시작 없음
* 은닉 실행 없음
* 제거 방지 없음
* 프로세스 위장 없음
* 외부 클라우드 전송 없음
* 내부망 Event Receiver 전송만 사용

---

## 11. 네트워크 Boundary

```text
Mini PC 일반 트래픽
→ 기존 공유기 및 인터넷 연결

Mini PC Agent Event
→ 내부망
→ Main PC Event Receiver
```

### 제외 범위

* Mini PC 트래픽의 Main PC 강제 우회
* Main PC DNS 서버 사용
* 공유기 DNS 설정 변경
* 패킷 Payload 전송
* HTTPS 트래픽 복호화
* 외부 서버 이벤트 전송
* 전체 네트워크 패킷 저장

---

## 12. 사용 원칙

* 허가된 환경에서만 사용
* 본인 소유 또는 관리 대상 단말만 사용
* 수집 범위 사전 확인
* 환경 변수와 Runtime 데이터의 Git 제외
* 사용자 실명 대신 별칭 사용
* 필요한 Metadata만 수집
* 보관 기간 경과 데이터 정리
* 상용 감시·EDR·DLP 용도 사용 제외
