import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

import { useSecurityEvents } from './hooks/useSecurityEvents';
import {
  getDnsDomain,
  getRuleId,
  type DashboardSecurityEvent,
} from './types/securityEvent';

// Dashboard 사용 Chart.js 요소 등록
ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
);

interface CountItem {
  label: string;
  count: number;
}

const chartTextColor = '#91a4a0';
const chartGridColor = '#223a35';

/**
 * 문자열별 발생 건수 집계
 */
const countValues = (
  values: readonly string[],
  limit?: number,
): CountItem[] => {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const items = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count);

  return limit === undefined ? items : items.slice(0, limit);
};

/**
 * 가로 막대 Chart 데이터 생성
 */
const createBarChartData = (
  label: string,
  items: readonly CountItem[],
): ChartData<'bar'> => ({
  labels: items.map((item) => item.label),
  datasets: [
    {
      label,
      data: items.map((item) => item.count),
      backgroundColor: '#45f5a1',
      borderColor: '#8affc1',
      borderWidth: 1,
    },
  ],
});

/**
 * 이벤트 발생 시각 화면 변환
 */
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime())
    ? timestamp
    : date.toLocaleString('ko-KR');
};

/**
 * 이벤트 Source IP와 Device ID 표시
 */
const formatSubject = (
  event: DashboardSecurityEvent,
): string => {
  const values = [event.sourceIp, event.deviceId].filter(
    (value): value is string => value !== undefined,
  );

  return values.length > 0 ? values.join(' / ') : '-';
};

/**
 * Bar Chart 공통 옵션
 */
const barChartOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',

  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#101b18',
      borderColor: '#45f5a1',
      borderWidth: 1,
      titleColor: '#f3fff9',
      bodyColor: '#c5d9d2',
    },
  },

  scales: {
    x: {
      beginAtZero: true,
      ticks: {
        color: chartTextColor,
        precision: 0,
      },
      grid: {
        color: chartGridColor,
      },
    },
    y: {
      ticks: {
        color: chartTextColor,
      },
      grid: {
        display: false,
      },
    },
  },
};

/**
 * OfficeGuard Lab 실시간 관제 Dashboard
 */
const App = () => {
  const {
    events,
    dnsEvents,
    ruleHits,
    webSocketStatus,
    loadError,
  } = useSecurityEvents();

  // 최근 이벤트 기준 이벤트 타입별 건수
  const eventTypeCounts = countValues(
    events.map((event) => event.eventType),
  );

  // 최근 DNS Query 기준 도메인 TOP 10
  const dnsDomainCounts = countValues(
    dnsEvents
      .map(getDnsDomain)
      .filter(
        (domain): domain is string =>
          domain !== undefined,
      ),
    10,
  );

  // 최근 DNS Query 기준 Source IP별 요청량
  const dnsSourceIpCounts = countValues(
    dnsEvents
      .map((event) => event.sourceIp)
      .filter(
        (sourceIp): sourceIp is string =>
          sourceIp !== undefined,
      ),
  );

  // HIGH 또는 CRITICAL Rule Hit 건수
  const highSeverityRuleHitCount = ruleHits.filter(
    (event) =>
      event.severity === 'HIGH' ||
      event.severity === 'CRITICAL',
  ).length;

  // 이벤트 타입 Doughnut Chart 데이터
  const eventTypeChartData: ChartData<'doughnut'> = {
    labels: eventTypeCounts.map((item) => item.label),
    datasets: [
      {
        label: '이벤트 수',
        data: eventTypeCounts.map((item) => item.count),
        backgroundColor: [
          '#45f5a1',
          '#60d5ff',
          '#ff6fcf',
          '#ffd166',
          '#9f8cff',
          '#ff7b72',
        ],
        borderColor: '#101b18',
        borderWidth: 2,
      },
    ],
  };

  const doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,

    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: chartTextColor,
          boxWidth: 10,
          boxHeight: 10,
        },
      },
      tooltip: {
        backgroundColor: '#101b18',
        borderColor: '#45f5a1',
        borderWidth: 1,
        titleColor: '#f3fff9',
        bodyColor: '#c5d9d2',
      },
    },
  };

  return (
    <main className="dashboard">
      {/* Dashboard 제목과 WebSocket 연결 상태 */}
      <header className="terminal-header">
        <div>
          <p className="terminal-path">
            root@officeguard:~/security
          </p>

          <h1>REALTIME SECURITY OBSERVATORY</h1>

          <p className="terminal-description">
            network metadata / endpoint events / rule detection
          </p>
        </div>

        <div
          className={
            `connection-status ` +
            `connection-status--${webSocketStatus.toLowerCase()}`
          }
        >
          <span className="status-indicator" />
          WEBSOCKET {webSocketStatus}
        </div>
      </header>

      {/* 초기 REST API 조회 오류 */}
      {loadError !== undefined && (
        <section className="error-message">
          <strong>[ERROR]</strong> {loadError}
        </section>
      )}

      {/* 주요 이벤트 요약 */}
      <section className="summary-grid">
        <article className="summary-card">
          <span>EVENTS</span>
          <strong>{events.length}</strong>
        </article>

        <article className="summary-card">
          <span>DNS QUERY</span>
          <strong>{dnsEvents.length}</strong>
        </article>

        <article className="summary-card">
          <span>RULE HITS</span>
          <strong>{ruleHits.length}</strong>
        </article>

        <article className="summary-card summary-card--alert">
          <span>HIGH + CRITICAL</span>
          <strong>{highSeverityRuleHitCount}</strong>
        </article>
      </section>

      {/* 최근 이벤트와 DNS Query 통계 */}
      <section className="chart-grid">
        <article className="terminal-panel">
          <div className="panel-title">
            <span>[ EVENT TYPE COUNTS ]</span>
            <small>RECENT 50</small>
          </div>

          <div className="chart-container">
            {eventTypeCounts.length > 0 ? (
              <Doughnut
                data={eventTypeChartData}
                options={doughnutChartOptions}
              />
            ) : (
              <p className="empty-message">
                NO EVENT DATA
              </p>
            )}
          </div>
        </article>

        <article className="terminal-panel">
          <div className="panel-title">
            <span>[ DNS DOMAIN TOP 10 ]</span>
            <small>RECENT DNS QUERY</small>
          </div>

          <div className="chart-container">
            {dnsDomainCounts.length > 0 ? (
              <Bar
                data={createBarChartData(
                  'DNS 요청 수',
                  dnsDomainCounts,
                )}
                options={barChartOptions}
              />
            ) : (
              <p className="empty-message">
                NO DNS DOMAIN DATA
              </p>
            )}
          </div>
        </article>

        <article className="terminal-panel">
          <div className="panel-title">
            <span>[ DNS REQUESTS BY SOURCE ]</span>
            <small>RECENT DNS QUERY</small>
          </div>

          <div className="chart-container">
            {dnsSourceIpCounts.length > 0 ? (
              <Bar
                data={createBarChartData(
                  'DNS 요청 수',
                  dnsSourceIpCounts,
                )}
                options={barChartOptions}
              />
            ) : (
              <p className="empty-message">
                NO SOURCE IP DATA
              </p>
            )}
          </div>
        </article>
      </section>

      {/* 실시간 이벤트와 Rule Hit 관제 영역 */}
      <section className="monitor-grid">
        <article className="terminal-panel">
          <div className="panel-title">
            <span>[ LIVE EVENT TIMELINE ]</span>
            <small>STREAMING</small>
          </div>

          <div className="event-list">
            {events.length === 0 ? (
              <p className="empty-message">
                WAITING FOR SECURITY EVENTS...
              </p>
            ) : (
              events.map((event) => (
                <div
                  className="event-row"
                  key={event.eventId}
                >
                  <time>
                    {formatTimestamp(event.timestamp)}
                  </time>

                  <strong>{event.eventType}</strong>

                  <p>{event.message}</p>

                  <span>{formatSubject(event)}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="terminal-panel">
          <div className="panel-title">
            <span>[ RULE HIT FEED ]</span>
            <small>DETECTION</small>
          </div>

          <div className="rule-hit-list">
            {ruleHits.length === 0 ? (
              <p className="empty-message">
                NO RULE HITS
              </p>
            ) : (
              ruleHits.map((event) => (
                <div
                  className="rule-hit-row"
                  key={event.eventId}
                >
                  <div className="rule-hit-header">
                    <strong>
                      {getRuleId(event) ?? 'UNKNOWN_RULE'}
                    </strong>

                    {event.severity !== undefined && (
                      <span
                        className={
                          `severity ` +
                          `severity--${event.severity.toLowerCase()}`
                        }
                      >
                        {event.severity}
                      </span>
                    )}
                  </div>

                  <p>{event.message}</p>

                  <div className="rule-hit-footer">
                    <span>{formatSubject(event)}</span>

                    <time>
                      {formatTimestamp(event.timestamp)}
                    </time>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {/* 시스템 구성 상태 표시 */}
      <footer className="terminal-footer">
        <span>STATUS: {webSocketStatus}</span>
        <span>STORAGE: POSTGRESQL</span>
        <span>PIPELINE: KAFKA</span>
        <span>ANALYZER: RULE-BASED</span>
      </footer>
    </main>
  );
};

export default App;