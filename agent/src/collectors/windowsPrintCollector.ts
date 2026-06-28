import type { WindowsPrintJobRecord } from '../events/endpointEvent.js';
import {
  startPowerShellJsonLineCollector,
  type PowerShellJsonLineCollector,
} from './powerShellJsonLineCollector.js';

interface StartWindowsPrintCollectorOptions {
  onRecord: (record: WindowsPrintJobRecord) => void;
  onFatalError: (error: Error) => void;
}

export type WindowsPrintCollector = PowerShellJsonLineCollector;

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Win32_PrintJob 생성 감지 Script
 */
const PRINT_COLLECTOR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$sourceIdentifier = 'OfficeGuardPrintJobWatcher'

try {
    # Win32_PrintJob 인스턴스 생성 이벤트 구독
    $query = "SELECT * FROM __InstanceCreationEvent WITHIN 1 WHERE TargetInstance ISA 'Win32_PrintJob'"
    Register-CimIndicationEvent -Query $query -SourceIdentifier $sourceIdentifier | Out-Null

    # Collector 준비 완료 출력
    $readyMessage = [ordered]@{
        kind = 'READY'
        source = 'Win32_PrintJob'
    }

    [Console]::Out.WriteLine(($readyMessage | ConvertTo-Json -Compress))

    while ($true) {
        # Print Job 생성 이벤트 대기
        $event = Wait-Event -SourceIdentifier $sourceIdentifier -Timeout 1

        if ($null -eq $event) {
            continue
        }

        try {
            # 생성된 Win32_PrintJob 인스턴스 조회
            $record = $event.SourceEventArgs.NewEvent.TargetInstance
            $jobId = [int]$record.JobId
            $printJobName = [string]$record.Name

            # Name 값의 마지막 Job ID 제거
            $printerName = $printJobName -replace ',\s*\d+$', ''

            # Name에서 프린터명을 확인하지 못한 경우 Caption 사용
            if ([string]::IsNullOrWhiteSpace($printerName)) {
                $printerName = [string]$record.Caption
            }

            $pageCount = $null

            # 확인 가능한 양의 페이지 수만 반영
            if ($null -ne $record.TotalPages -and [int]$record.TotalPages -gt 0) {
                $pageCount = [int]$record.TotalPages
            }

            # Node.js 전달용 JSON Line 구성
            $message = [ordered]@{
                kind = 'PRINT_JOB_RECORD'
                timestamp = [DateTime]::UtcNow.ToString('o')
                printerName = $printerName
                jobId = $jobId
                documentName = [string]$record.Document
                pageCount = $pageCount
            }

            [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress))
        }
        catch {
            [Console]::Error.WriteLine(
                '[print-collector] event parse failed: ' +
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
        '[print-collector] startup failed: ' +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # Print Job 이벤트 구독 해제
    Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
}
`;

/**
 * Windows Print Job 생성 감지
 */
export const startWindowsPrintCollector = (
  options: StartWindowsPrintCollectorOptions,
): WindowsPrintCollector =>
  startPowerShellJsonLineCollector({
    collectorName: 'print-collector',
    script: PRINT_COLLECTOR_SCRIPT,

    onValue: (value) => {
      if (!isRecord(value)) {
        throw new Error( 'collector message must be an object' );
      }

      // PowerShell Collector 준비 완료 처리
      if (value.kind === 'READY') {
        console.log( `[print-collector] started. source=${String(value.source)}` );

        return;
      }

      if (value.kind !== 'PRINT_JOB_RECORD') {
        throw new Error( 'unknown collector message' );
      }

      const {
        timestamp,
        printerName,
        jobId,
        documentName,
        pageCount,
      } = value;

      // 필수 Print Job 수집값 검증
      if (
        typeof timestamp !== 'string' ||
        typeof printerName !== 'string' ||
        typeof jobId !== 'number'
      ) {
        throw new Error( 'invalid Print Job record' );
      }

      const record: WindowsPrintJobRecord = {
        timestamp,
        printerName,
        jobId,
      };

      // 확인 가능한 문서명만 별칭 생성 대상으로 전달
      if (
        typeof documentName === 'string' &&
        documentName.trim() !== ''
      ) {
        record.documentName = documentName.trim();
      }

      // 확인 가능한 양의 페이지 수만 반영
      if (
        typeof pageCount === 'number' &&
        Number.isSafeInteger(pageCount) &&
        pageCount > 0
      ) {
        record.pageCount = pageCount;
      }

      options.onRecord(record);
    },

    onFatalError: options.onFatalError,
  });