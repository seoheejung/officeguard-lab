# Realtime Dashboard

## 1. 개요

보안 이벤트와 Rule Hit의 실시간 시각화

Charm 스타일 터미널 관제 UI 기반 Dashboard 구성

---

## 2. 기술 구성

```text
React
TypeScript
Vite
Chart.js
WebSocket
```

---

## 3. UI 구성

```text
Charm 스타일 터미널 관제 UI
어두운 배경 기반 화면 구성
고정폭 글꼴 기반 정보 표시
Panel 단위 정보 구분
Severity별 시각적 구분
실시간 관제 화면 형태의 Layout
```

---

## 4. 실행 화면

![OfficeGuard Lab Realtime Dashboard](./image/dashboard.png)

### 실행 화면 표시 항목

* Charm 스타일 터미널 관제 UI
* WebSocket 연결 상태
* 전체 이벤트 수
* DNS Query 수
* Rule Hit 수
* HIGH / CRITICAL Rule Hit 수
* 이벤트 타입별 통계
* DNS 도메인 TOP 10
* Source IP별 DNS 요청량
* 실시간 이벤트 타임라인
* Rule Hit 목록

---

## 5. 데이터 흐름

```text
초기 화면
→ REST API 최근 이벤트 조회

신규 이벤트
→ WebSocket SECURITY_EVENT 수신

REST API + WebSocket
→ eventId 기준 병합
→ 중복 제거
→ 최신 50건 유지
```

### 초기 조회 API

```text
GET /api/events?limit=50
GET /api/events?eventType=DNS_QUERY&limit=50
GET /api/rule-hits?limit=50
```

### 실시간 연결

```text
ws://localhost:4000/ws
```

---

## 6. 화면 구성

### Header

```text
OFFICEGUARD LAB
REALTIME SECURITY OBSERVATORY
WebSocket 연결 상태
```

### Summary

```text
전체 이벤트 수
DNS Query 수
Rule Hit 수
HIGH / CRITICAL Rule Hit 수
```

### Charts

```text
이벤트 타입별 건수
DNS 도메인 TOP 10
Source IP별 DNS 요청량
```

### Monitoring

```text
실시간 이벤트 타임라인
Rule Hit 목록
```

### Footer

```text
WebSocket
PostgreSQL
Kafka
Analyzer
```

---

## 7. 이벤트 타임라인

### 표시 항목

```text
timestamp
eventType
message
sourceIp
deviceId
severity
```

전체 `metadata` JSON 기본 표시 제외

---

## 8. Rule Hit 목록

### 표시 항목

```text
timestamp
severity
ruleId
message
sourceIp
deviceId
```

Severity별 시각적 구분 적용

---

## 9. WebSocket 상태

```text
CONNECTING
CONNECTED
DISCONNECTED
ERROR
```

### 현재 연결 복구 방식

```text
연결 종료 또는 오류
→ Dashboard 새로고침
→ WebSocket 재연결
```

자동 재연결 미구현

---

