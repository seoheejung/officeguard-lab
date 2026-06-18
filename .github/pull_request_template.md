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
* [ ] Phase 7. Realtime Dashboard
* [ ] Phase 8. Mini PC DNS 연동
* [ ] Phase 9. 문서화 / 시연

---

## 세부 구현 항목

<!-- 이번 PR에서 구현한 항목만 체크 -->

### Backend

* [ ] Node.js + TypeScript 프로젝트 구성
* [ ] Express 서버 구성
* [ ] Health check API 구현
* [ ] 환경 설정 분리
* [ ] 공통 에러 처리 추가

### Event Model

* [ ] SecurityEvent 타입 정의
* [ ] DNS_QUERY 이벤트 정의
* [ ] NETWORK_FLOW 이벤트 정의
* [ ] Endpoint 이벤트 정의
* [ ] RULE_HIT 이벤트 정의

### Collector

* [ ] DNS Event Collector 구현
* [ ] Network Flow Collector 구현
* [ ] Endpoint Mock Collector 구현
* [ ] 이벤트 정규화 로직 구현

### Pipeline

* [ ] Kafka 구성
* [ ] Redis Stream 구성
* [ ] Producer 구현
* [ ] Consumer 구현
* [ ] 이벤트 publish/consume 검증

### Analyzer

* [ ] Rule 모델 정의
* [ ] 단일 이벤트 기반 탐지 구현
* [ ] 연속 이벤트 기반 탐지 구현
* [ ] Rule Hit 이벤트 생성
* [ ] severity 구분 처리

### Storage

* [ ] 이벤트 저장 구조 설계
* [ ] SecurityEvent 저장
* [ ] Rule Hit 저장
* [ ] 최근 이벤트 조회 API 구현
* [ ] IP 또는 deviceId 기준 필터링 구현

### WebSocket / Dashboard

* [ ] WebSocket 서버 구현
* [ ] 실시간 이벤트 전달 구현
* [ ] 이벤트 타임라인 표시
* [ ] DNS 요청 현황 표시
* [ ] Rule Hit 목록 표시

### Infra / Mini PC

* [ ] Docker Compose 구성
* [ ] Mini PC 실행 환경 정리
* [ ] DNS 관측 도구 연동
* [ ] 로컬 실행 절차 문서화

### Documentation

* [ ] README 수정
* [ ] 아키텍처 문서 수정
* [ ] 이벤트 모델 문서 수정
* [ ] Rule 문서 수정
* [ ] Privacy boundary 문서 수정

---

## 검증 항목

<!-- 수행한 검증에 체크 -->

* [ ] `pnpm install` 정상 완료
* [ ] `pnpm typecheck` 통과
* [ ] `pnpm test` 통과
* [ ] `pnpm dev` 실행 확인
* [ ] Docker Compose 실행 확인
* [ ] Health check API 응답 확인
* [ ] Mock 이벤트 생성 확인
* [ ] 이벤트 publish/consume 확인
* [ ] WebSocket 연결 확인
* [ ] Dashboard 실시간 반영 확인

---

## 보안 / 프라이버시 점검

* [ ] 패킷 payload를 저장하지 않음
* [ ] 계정 비밀번호, 쿠키, 토큰을 수집하지 않음
* [ ] 개인 파일 본문을 수집하지 않음
* [ ] 키보드 입력 또는 화면 캡처 기능이 없음
* [ ] 사용자 실명 기반 감시 기능이 없음
* [ ] 민감 정보가 코드 또는 문서에 포함되지 않음
* [ ] `.env`, 로그, 런타임 데이터가 Git에 포함되지 않음

---

## 영향 범위

<!-- 기존 기능에 영향이 있는 경우 작성 -->

*

---

## 참고 사항

<!-- 리뷰어가 알아야 할 내용 작성 -->

*
