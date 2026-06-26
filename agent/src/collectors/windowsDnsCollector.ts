import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { WindowsDnsRecord } from '../events/dnsQueryEvent.js';

const DNS_LOG_NAME = 'Microsoft-Windows-DNS-Client/Operational';
const DNS_EVENT_ID = 3008;

interface StartDnsCollectorOptions {
  onRecord: (record: WindowsDnsRecord) => void;
  onFatalError: (error: Error) => void;
}

export interface WindowsDnsCollector {
  stop: () => void;
}

/**
 * 일반 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

/**
 * PowerShell EncodedCommand 생성
 */
const encodePowerShellCommand = (script: string): string =>
  Buffer.from(script, 'utf16le').toString('base64');

/**
 * Windows DNS Event 구독 Script 생성
 */
const createCollectorScript = (): string => String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$logName = '${DNS_LOG_NAME}'
$eventId = ${DNS_EVENT_ID}
$sourceIdentifier = 'OfficeGuardDnsWatcher'

try {
    # DNS Client Operational Log 조회
    $log = Get-WinEvent -ListLog $logName -ErrorAction Stop

    # DNS Event Log 활성화 상태 검증
    if (-not $log.IsEnabled) {
        throw "DNS Event Log is disabled: $logName"
    }

    # Event ID 조회 조건 생성
    $queryText = "*[System[(EventID=$eventId)]]"

    # DNS Event 조회 객체 생성
    $query = [System.Diagnostics.Eventing.Reader.EventLogQuery]::new(
        $logName,
        [System.Diagnostics.Eventing.Reader.PathType]::LogName,
        $queryText
    )

    # 신규 DNS Event 구독 객체 생성
    $watcher = [System.Diagnostics.Eventing.Reader.EventLogWatcher]::new(
        $query,
        $null,
        $false
    )

    # DNS Event 처리 설정
    $eventAction = {
        $eventException = $Event.SourceEventArgs.EventException

        if ($null -ne $eventException) {
            [Console]::Error.WriteLine(
                "[dns-collector] watcher error: " +
                $eventException.Message
            )

            return
        }

        $eventRecord = $Event.SourceEventArgs.EventRecord

        if ($null -eq $eventRecord) {
            return
        }

        try {
            # Event XML 변환
            [xml]$eventXml = $eventRecord.ToXml()

            # EventData 이름과 값 매핑
            $eventData = @{}

            foreach ($dataElement in $eventXml.Event.EventData.Data) {
                $eventData[[string]$dataElement.Name] =
                    [string]$dataElement.'#text'
            }

            # Node.js 전달용 DNS 기록 구성
            $message = [ordered]@{
                kind = 'DNS_RECORD'
                recordId = [long]$eventRecord.RecordId
                timestamp = $eventRecord.TimeCreated.ToUniversalTime().ToString('o')
                queryName = [string]$eventData['QueryName']
                queryType = [int]$eventData['QueryType']
                queryStatus = [int]$eventData['QueryStatus']
            }

            # JSON 한 줄 출력
            [Console]::Out.WriteLine(
                ($message | ConvertTo-Json -Compress)
            )
        }
        catch {
            [Console]::Error.WriteLine(
                "[dns-collector] event parse failed: " +
                $_.Exception.Message
            )
        }
        finally {
            # Event Record 리소스 해제
            $eventRecord.Dispose()
        }
    }

    # DNS Event 처리 등록
    $eventParameters = @{
        InputObject = $watcher
        EventName = 'EventRecordWritten'
        SourceIdentifier = $sourceIdentifier
        Action = $eventAction
    }

    Register-ObjectEvent @eventParameters | Out-Null

    # DNS Event 구독 시작
    $watcher.Enabled = $true

    # Collector 준비 완료 메시지 구성
    $readyMessage = [ordered]@{
        kind = 'READY'
        logName = $logName
        eventId = $eventId
    }

    [Console]::Out.WriteLine(
        ($readyMessage | ConvertTo-Json -Compress)
    )

    # Collector Process 실행 유지
    while ($true) {
        Start-Sleep -Milliseconds 500
    }
}
catch {
    [Console]::Error.WriteLine(
        "[dns-collector] startup failed: " +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # Event 구독 리소스 정리
    if ($null -ne $watcher) {
        $watcher.Enabled = $false
        $watcher.Dispose()
    }

    Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
}
`;

/**
 * Windows DNS Event Log 신규 이벤트 구독
 */
export const startWindowsDnsCollector = (
  options: StartDnsCollectorOptions,
): WindowsDnsCollector => {
  // Windows 실행 환경 검증
  if (process.platform !== 'win32') {
    throw new Error('[dns-collector] Windows platform is required');
  }

  // PowerShell Script Base64 인코딩
  const encodedCommand = encodePowerShellCommand(createCollectorScript());

  let stopping = false;

  // DNS Event 수집용 PowerShell Process 실행
  const childProcess = spawn(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encodedCommand,
    ],
    {
      windowsHide: true,
    },
  );

  // PowerShell 표준 출력의 줄 단위 처리
  const outputLines = createInterface({
    input: childProcess.stdout,
  });

  outputLines.on('line', (line) => {
    if (line.trim() === '') {
      return;
    }

    try {
      // PowerShell JSON 메시지 변환
      const parsedValue: unknown = JSON.parse(line);

      if (!isRecord(parsedValue)) {
        throw new Error('collector message must be an object');
      }

      // Collector 준비 완료 메시지 처리
      if (parsedValue.kind === 'READY') {
        console.log(
          `[dns-collector] started. logName=${String(parsedValue.logName)} eventId=${String(parsedValue.eventId)}`,
        );

        return;
      }

      // DNS 기록 외 메시지 제외
      if (parsedValue.kind !== 'DNS_RECORD') {
        throw new Error('unknown collector message');
      }

      const {
        recordId,
        timestamp,
        queryName,
        queryType,
        queryStatus,
      } = parsedValue;

      // DNS 기록 필드 형식 검증
      if (
        typeof recordId !== 'number' ||
        typeof timestamp !== 'string' ||
        typeof queryName !== 'string' ||
        typeof queryType !== 'number' ||
        typeof queryStatus !== 'number'
      ) {
        throw new Error('invalid DNS record message');
      }

      // 검증 완료 DNS 기록 전달
      options.onRecord({
        recordId,
        timestamp,
        queryName,
        queryType,
        queryStatus,
      });
    } catch (error) {
      console.error('[dns-collector] invalid output:', error);
    }
  });

  // PowerShell 오류 출력 전달
  childProcess.stderr.on('data', (chunk: Buffer) => {
    const message = chunk.toString('utf8').trim();

    if (message !== '') {
      console.error(message);
    }
  });

  // PowerShell Process 실행 실패 처리
  childProcess.on('error', (error) => {
    if (!stopping) {
      options.onFatalError(error);
    }
  });

  // 예상하지 못한 PowerShell Process 종료 처리
  childProcess.on('exit', (code, signal) => {
    if (stopping) {
      return;
    }

    options.onFatalError(
      new Error(
        `[dns-collector] process exited unexpectedly. code=${String(code)} signal=${String(signal)}`,
      ),
    );
  });

  return {
    stop: (): void => {
      // 정상 종료 상태 설정
      stopping = true;

      // 표준 출력 처리 종료
      outputLines.close();

      // PowerShell Process 종료
      if (!childProcess.killed) {
        childProcess.kill();
      }
    },
  };
};