import type { WindowsProcessStartRecord } from '../events/endpointEvent.js';
import {
  startPowerShellJsonLineCollector,
  type PowerShellJsonLineCollector,
} from './powerShellJsonLineCollector.js';

interface StartWindowsProcessCollectorOptions {
  onRecord: (record: WindowsProcessStartRecord) => void;
  onFatalError: (error: Error) => void;
}

export type WindowsProcessCollector = PowerShellJsonLineCollector;

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Win32_ProcessStartTrace 구독 Script
 */
const PROCESS_COLLECTOR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$sourceIdentifier = 'OfficeGuardProcessStartWatcher'

try {
    # 프로세스 시작 이벤트 구독
    $query = 'SELECT * FROM Win32_ProcessStartTrace'
    Register-CimIndicationEvent -Query $query -SourceIdentifier $sourceIdentifier | Out-Null

    # Collector 준비 완료 출력
    $readyMessage = [ordered]@{
        kind = 'READY'
        source = 'Win32_ProcessStartTrace'
    }

    [Console]::Out.WriteLine(($readyMessage | ConvertTo-Json -Compress))

    while ($true) {
        # 프로세스 시작 이벤트 대기
        $event = Wait-Event -SourceIdentifier $sourceIdentifier -Timeout 1

        if ($null -eq $event) {
            continue
        }

        try {
            # WMI 이벤트 필드 추출
            $record = $event.SourceEventArgs.NewEvent
            $processId = [int]$record.ProcessID
            $parentProcessId = [int]$record.ParentProcessID
            $processName = [string]$record.ProcessName
            $timestamp = [DateTime]::UtcNow

            # Windows FILETIME 기반 발생 시각 변환
            if ($null -ne $record.TIME_CREATED) {
                try {
                    $timestamp = [DateTime]::FromFileTimeUtc(
                        [long]$record.TIME_CREATED
                    )
                }
                catch {
                    $timestamp = [DateTime]::UtcNow
                }
            }

            $executablePath = $null

            # Process ID 기반 실행 파일 경로 보완 조회
            try {
                $process = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue

                if ($null -ne $process) {
                    $executablePath = $process.ExecutablePath
                }
            }
            catch {
                # 종료된 프로세스 또는 접근 제한 경로 생략
                $executablePath = $null
            }

            # Node.js 전달용 JSON Line 구성
            $message = [ordered]@{
                kind = 'PROCESS_START_RECORD'
                timestamp = $timestamp.ToString('o')
                processName = $processName
                processId = $processId
                parentProcessId = $parentProcessId
                executablePath = $executablePath
            }

            [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress))
        }
        catch {
            [Console]::Error.WriteLine(
                '[process-collector] event parse failed: ' +
                $_.Exception.Message
            )
        }
        finally {
            # 처리 완료 PowerShell Event 제거
            Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
        }
    }
}
catch {
    [Console]::Error.WriteLine(
        '[process-collector] startup failed: ' +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # 프로세스 시작 이벤트 구독 해제
    Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
}
`;


/**
 * Windows 프로세스 시작 이벤트 구독
 */
export const startWindowsProcessCollector = (
  options: StartWindowsProcessCollectorOptions,
): WindowsProcessCollector =>
  startPowerShellJsonLineCollector({
    collectorName: 'process-collector',
    script: PROCESS_COLLECTOR_SCRIPT,

    onValue: (value) => {
      if (!isRecord(value)) {
        throw new Error('collector message must be an object');
      }

      // PowerShell Collector 준비 완료 처리
      if (value.kind === 'READY') {
        console.log(
          `[process-collector] started. source=${String(value.source)}`,
        );

        return;
      }

      if (value.kind !== 'PROCESS_START_RECORD') {
        throw new Error('unknown collector message');
      }

      const {
        timestamp,
        processName,
        processId,
        parentProcessId,
        executablePath,
      } = value;

      // 필수 프로세스 수집값 검증
      if (
        typeof timestamp !== 'string' ||
        typeof processName !== 'string' ||
        typeof processId !== 'number' ||
        typeof parentProcessId !== 'number'
      ) {
        throw new Error('invalid process record');
      }

      const record: WindowsProcessStartRecord = {
        timestamp,
        processName,
        processId,
        parentProcessId,
      };

      // 확인 가능한 실행 파일 경로만 반영
      if (
        typeof executablePath === 'string' &&
        executablePath.trim() !== ''
      ) {
        record.executablePath = executablePath.trim();
      }

      options.onRecord(record);
    },

    onFatalError: options.onFatalError,
  });