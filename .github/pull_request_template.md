## 작업 내용

<!-- 이번 PR에서 실제로 수행한 작업을 작성 -->

*

---

## 변경 요약

<!-- 변경된 파일과 핵심 변경 사항을 작성 -->

*

---

## 구현 단계

<!-- 이번 PR과 직접 관련 있는 Phase에 체크 -->

* [ ] Phase 1. 프로젝트 초기 구성
* [ ] Phase 2. 이벤트 모델 정의
* [ ] Phase 3. Mock Event Generator
* [ ] Phase 4. Event Pipeline
* [ ] Phase 5. Rule-based Analyzer
* [ ] Phase 6. Storage
* [ ] Phase 7. WebSocket & Realtime Dashboard
* [ ] Phase 8. Mini PC Agent 기본 구성 및 DNS Event 연동
* [ ] Phase 9. Mini PC Agent Network Flow 수집
* [ ] Phase 10. Mini PC Agent Endpoint Event 수집
* [ ] Phase 11. Privacy & Data Protection
* [ ] Phase 12. 문서화 / 시연

---

## 세부 구현 항목

<!-- 이번 PR에서 구현한 항목만 체크 -->

### Backend

* [ ] Node.js + TypeScript 프로젝트 구성
* [ ] Express 서버 구성
* [ ] Health Check API 구현
* [ ] 환경 설정 분리
* [ ] 공통 오류 처리 추가

### Event Model

* [ ] `SecurityEvent` 타입 정의
* [ ] `DNS_QUERY` 이벤트 정의
* [ ] `NETWORK_FLOW` 이벤트 정의
* [ ] Endpoint 이벤트 정의
* [ ] `RULE_HIT` 이벤트 정의
* [ ] 이벤트별 metadata 타입 정의

### Mini PC Agent

* [ ] Mini PC Agent 프로젝트 구성
* [ ] Mini PC Agent 단일 실행 파일 생성
* [ ] 설치 과정 없는 수동 실행 구성
* [ ] DNS 요청 기록 수집
* [ ] Network Flow Metadata 수집
* [ ] 프로세스 실행 감지
* [ ] 파일 생성, 수정 및 삭제 감지
* [ ] USB 저장 장치 연결 및 해제 감지
* [ ] USB 저장 장치 대상 파일 복사 감지
* [ ] 프린트 요청 이벤트 수집
* [ ] 테스트 메일 첨부 전송 이벤트 수집
* [ ] 실제 수집 데이터 정규화
* [ ] `SecurityEvent` 변환
* [ ] 내부망을 통한 Main PC 이벤트 전송

### Event Receiver

* [ ] Main PC Event Receiver 구현
* [ ] Mini PC Agent 이벤트 수신
* [ ] 수신 이벤트 구조 검증
* [ ] 유효하지 않은 이벤트 처리
* [ ] Kafka Topic 발행
* [ ] 내부망 통신 확인

### Pipeline

* [ ] Kafka 구성
* [ ] Kafka Producer 구현
* [ ] Kafka Consumer 구현
* [ ] Topic 생성 또는 확인
* [ ] 이벤트 Publish / Consume 검증
* [ ] 발행 및 수신 `eventId` 일치 확인

### Analyzer

* [ ] Rule 모델 정의
* [ ] 단일 이벤트 기반 탐지 구현
* [ ] 연속 이벤트 기반 탐지 구현
* [ ] 시간 범위 집계 탐지 구현
* [ ] Rule Hit 이벤트 생성
* [ ] Severity 구분 처리
* [ ] Rule Hit Kafka 재발행
* [ ] `RULE_HIT` 재분석 방지

### Storage

* [ ] 이벤트 저장 구조 설계
* [ ] `SecurityEvent` 저장
* [ ] `RULE_HIT` 저장
* [ ] 동일 `eventId` 중복 저장 방지
* [ ] 최근 이벤트 조회 API 구현
* [ ] 이벤트 단건 조회 API 구현
* [ ] Rule Hit 조회 API 구현
* [ ] 시간 범위 조회 구현
* [ ] `eventType`, `sourceIp`, `deviceId` 필터링 구현
* [ ] `severity`, `ruleId` 필터링 구현

### WebSocket / Dashboard

* [ ] WebSocket 서버 구현
* [ ] `/ws` Endpoint 구성
* [ ] 신규 `SecurityEvent` 실시간 전달
* [ ] 신규 `RULE_HIT` 실시간 전달
* [ ] REST API 기반 초기 데이터 조회
* [ ] REST API와 WebSocket 이벤트 병합
* [ ] `eventId` 기준 중복 표시 방지
* [ ] 이벤트 타임라인 표시
* [ ] DNS 요청 현황 표시
* [ ] 이벤트 타입별 건수 표시
* [ ] DNS 도메인 TOP 10 표시
* [ ] Source IP별 DNS 요청량 표시
* [ ] Rule Hit 목록 및 Severity 표시
* [ ] HIGH / CRITICAL Rule Hit 건수 표시
* [ ] WebSocket 연결 상태 표시
* [ ] Chart.js 기반 통계 표시
* [ ] Charm 스타일 터미널 관제 UI 적용

### Infra / Main PC / Mini PC

* [ ] Docker Compose 구성
* [ ] Backend 컨테이너 구성
* [ ] Dashboard 컨테이너 구성
* [ ] PostgreSQL 구성
* [ ] Kafka 구성
* [ ] Main PC 보안 관측 서버 환경 구성
* [ ] Mini PC 검사 대상 환경 구성
* [ ] Main PC와 Mini PC 내부망 연결 확인
* [ ] Mini PC Agent 실행 환경 구성
* [ ] Mini PC Agent 단일 실행 파일 생성
* [ ] 로컬 실행 절차 문서화
* [ ] Docker Compose 실행 절차 문서화

### Privacy & Data Protection

* [ ] 내부 IP 익명화 구현
* [ ] 민감 도메인 마스킹 구현
* [ ] 이벤트 보관 기간 설정
* [ ] 보관 기간이 지난 이벤트 정리
* [ ] 이벤트 조회 API 접근 로그 기록
* [ ] 개인정보 보호 환경 변수 분리

### Documentation

* [ ] README 수정
* [ ] 시스템 구조 문서 수정
* [ ] 이벤트 모델 문서 수정
* [ ] Rule 문서 수정
* [ ] Storage API 문서 수정
* [ ] WebSocket 문서 수정
* [ ] Dashboard 문서 수정
* [ ] Mini PC Agent 문서 수정
* [ ] Main PC Event Receiver 문서 수정
* [ ] Agent 단일 실행 파일 실행 방법 문서화
* [ ] 내부망 이벤트 전송 흐름 문서화
* [ ] Privacy Boundary 문서 수정
* [ ] 시연 시나리오 수정

---

## 검증 항목

<!-- 수행한 검증에 체크 -->

### Backend

* [ ] `pnpm install` 정상 완료
* [ ] `pnpm typecheck` 통과
* [ ] `pnpm build` 통과
* [ ] `pnpm start` 실행 확인
* [ ] `pnpm dev` 실행 확인
* [ ] Health Check API 응답 확인
* [ ] 기존 조회 API 응답 확인
* [ ] Event Receiver 실행 확인
* [ ] 수신 이벤트 구조 검증 확인

### Mini PC Agent

* [ ] Agent 의존성 설치 완료
* [ ] Agent typecheck 통과
* [ ] Agent build 통과
* [ ] Agent 단일 실행 파일 생성 확인
* [ ] 설치 과정 없이 Agent 실행 확인
* [ ] Agent 직접 종료 확인
* [ ] DNS 요청 수집 확인
* [ ] Network Flow 수집 확인
* [ ] Endpoint Event 수집 확인
* [ ] `SecurityEvent` 변환 확인
* [ ] 내부망 이벤트 전송 확인

### Dashboard

* [ ] `pnpm install` 정상 완료
* [ ] `pnpm typecheck` 통과
* [ ] `pnpm build` 통과
* [ ] `pnpm dev` 실행 확인
* [ ] REST API 초기 조회 확인
* [ ] WebSocket 연결 확인
* [ ] SecurityEvent 실시간 반영 확인
* [ ] Rule Hit 실시간 반영 확인
* [ ] 동일 `eventId` 중복 표시 방지 확인

### Pipeline / Storage

* [ ] Mock 이벤트 생성 확인
* [ ] 이벤트 Publish / Consume 확인
* [ ] PostgreSQL 저장 확인
* [ ] 동일 `eventId` 중복 저장 방지 확인
* [ ] Rule-based Analyzer 동작 확인
* [ ] Rule Hit Kafka 재발행 확인

### Main PC / Mini PC

* [ ] Main PC 서버 실행 확인
* [ ] Main PC Event Receiver 실행 확인
* [ ] Mini PC Agent 실행 확인
* [ ] Main PC와 Mini PC 내부망 연결 확인
* [ ] Mini PC DNS 요청 수집 확인
* [ ] Mini PC Network Flow 수집 확인
* [ ] Mini PC Endpoint Event 수집 확인
* [ ] Mini PC에서 Main PC로 이벤트 전송 확인
* [ ] Main PC Event Receiver 이벤트 수신 확인

### Docker Compose

* [ ] `docker compose config` 확인
* [ ] Docker Compose Build 성공
* [ ] Docker Compose 전체 서비스 실행 확인
* [ ] Kafka Health Check 통과
* [ ] PostgreSQL Health Check 통과
* [ ] Backend Health Check 통과
* [ ] Dashboard Health Check 통과

### Test

* [ ] `pnpm test` 통과
* [ ] 별도 테스트 없음

---

## 보안 / 프라이버시 점검

* [ ] 허가된 홈랩 Mini PC에서만 Agent를 실행함
* [ ] Agent 설치 프로그램을 구성하지 않음
* [ ] Agent를 Windows Service로 등록하지 않음
* [ ] Agent 자동 시작을 구성하지 않음
* [ ] Agent 은닉 실행 또는 프로세스 위장 기능이 없음
* [ ] Agent 제거 방지 또는 강제 재실행 기능이 없음
* [ ] Mini PC와 Main PC 사이 내부망으로만 이벤트를 전송함
* [ ] 패킷 Payload를 저장하지 않음
* [ ] HTTPS 본문을 수집하지 않음
* [ ] 계정 비밀번호, Cookie, Token을 수집하지 않음
* [ ] 개인 파일 본문을 수집하지 않음
* [ ] 키보드 입력 또는 화면 캡처 기능이 없음
* [ ] 사용자 실명 기반 감시 기능이 없음
* [ ] 실제 USB Serial Number를 저장하지 않음
* [ ] 전체 metadata를 Dashboard에 노출하지 않음
* [ ] 민감 정보가 코드 또는 문서에 포함되지 않음
* [ ] `.env`, 로그, 런타임 데이터가 Git에 포함되지 않음
* [ ] Build 결과물이 Git에 포함되지 않음
* [ ] Backend와 Dashboard를 외부 인터넷에 직접 공개하지 않음

---

## 영향 범위

<!-- 기존 기능에 영향이 있는 경우 작성 -->

*

---

## 참고 사항

<!-- 리뷰어가 알아야 할 내용 작성 -->

*
