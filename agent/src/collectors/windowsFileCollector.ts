import type {
  WindowsFileChangeType,
  WindowsFileRecord,
} from '../events/endpointEvent.js';
import {
  escapePowerShellSingleQuotedString,
  startPowerShellJsonLineCollector,
  type PowerShellJsonLineCollector,
} from './powerShellJsonLineCollector.js';

interface StartWindowsFileCollectorOptions {
  watchPath: string;
  debounceMs: number;
  collectorName?: string;
  onRecord: (record: WindowsFileRecord) => void;
  onFatalError: (error: Error) => void;
}

export type WindowsFileCollector = PowerShellJsonLineCollector;

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 파일 감시 PowerShell Script 생성
 */
const createFileCollectorScript = (watchPath: string): string => {
  const escapedWatchPath = escapePowerShellSingleQuotedString(watchPath);

  return String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$watchPath = '${escapedWatchPath}'
$createdSource = 'OfficeGuardFileCreatedWatcher'
$changedSource = 'OfficeGuardFileChangedWatcher'
$deletedSource = 'OfficeGuardFileDeletedWatcher'
$watcher = $null

try {
    # 감시 대상 디렉터리 확인
    if (-not (Test-Path -LiteralPath $watchPath -PathType Container)) {
        throw "watch path not found: $watchPath"
    }

    # 디렉터리 삭제 이벤트 제외용 경로 목록 생성
    $knownDirectories = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )

    $null = $knownDirectories.Add([System.IO.Path]::GetFullPath($watchPath))

    Get-ChildItem -LiteralPath $watchPath -Directory -Recurse -Force -ErrorAction SilentlyContinue |
        ForEach-Object {
            $null = $knownDirectories.Add($_.FullName)
        }

    # FileSystemWatcher 생성 및 감시 조건 설정
    $watcher = [System.IO.FileSystemWatcher]::new()
    $watcher.Path = $watchPath
    $watcher.Filter = '*'
    $watcher.IncludeSubdirectories = $true
    $watcher.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor
        [System.IO.NotifyFilters]::LastWrite -bor
        [System.IO.NotifyFilters]::Size -bor
        [System.IO.NotifyFilters]::DirectoryName

    # 파일 생성·수정·삭제 이벤트 등록
    Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier $createdSource | Out-Null
    Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier $changedSource | Out-Null
    Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier $deletedSource | Out-Null

    $watcher.EnableRaisingEvents = $true

    # Collector 준비 완료 출력
    $readyMessage = [ordered]@{
        kind = 'READY'
        watchPath = $watchPath
    }

    [Console]::Out.WriteLine(($readyMessage | ConvertTo-Json -Compress))

    while ($true) {
        # 등록된 파일 이벤트 대기
        $event = Wait-Event -Timeout 1

        if ($null -eq $event) {
            continue
        }

        try {
            $eventArgs = $event.SourceEventArgs
            $fullPath = [System.IO.Path]::GetFullPath(
                [string]$eventArgs.FullPath
            )

            # PowerShell 이벤트의 Agent 변경 타입 변환
            $changeType = switch ($event.SourceIdentifier) {
                $createdSource { 'CREATED' }
                $changedSource { 'MODIFIED' }
                $deletedSource { 'DELETED' }
                default { $null }
            }

            if ($null -eq $changeType) {
                continue
            }

            $item = $null

            if ($changeType -eq 'DELETED') {
                # 디렉터리 삭제 이벤트 제외
                if ($knownDirectories.Contains($fullPath)) {
                    $null = $knownDirectories.Remove($fullPath)
                    continue
                }
            }
            else {
                # 생성·수정 대상의 실제 파일 여부 확인
                $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue

                if ($null -eq $item) {
                    continue
                }

                # 디렉터리 이벤트 목록 갱신 후 제외
                if ($item.PSIsContainer) {
                    $null = $knownDirectories.Add($fullPath)
                    continue
                }
            }

            $sizeBytes = $null

            # 삭제되지 않은 파일의 현재 크기 확인
            if ($changeType -ne 'DELETED' -and $null -ne $item) {
                $sizeBytes = [long]$item.Length
            }

            # Node.js 전달용 JSON Line 구성
            $message = [ordered]@{
                kind = 'FILE_RECORD'
                timestamp = [DateTime]::UtcNow.ToString('o')
                changeType = $changeType
                path = $fullPath
                sizeBytes = $sizeBytes
            }

            [Console]::Out.WriteLine(($message | ConvertTo-Json -Compress))
        }
        catch {
            [Console]::Error.WriteLine(
                '[file-collector] event parse failed: ' +
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
        '[file-collector] startup failed: ' +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # FileSystemWatcher 종료
    if ($null -ne $watcher) {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
    }

    # 등록된 파일 이벤트 구독 해제
    Unregister-Event -SourceIdentifier $createdSource -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $changedSource -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $deletedSource -ErrorAction SilentlyContinue
}
`;
};

/**
 * Windows 파일 생성·수정·삭제 감지
 */
export const startWindowsFileCollector = (
  options: StartWindowsFileCollectorOptions,
): WindowsFileCollector => {
  const collectorName = options.collectorName ?? 'file-collector';

  // 파일 경로와 변경 타입별 마지막 처리 시각
  const lastEventAtByKey = new Map<string, number>();

  return startPowerShellJsonLineCollector({
    collectorName,
    script: createFileCollectorScript(options.watchPath),

    onValue: (value) => {
      if (!isRecord(value)) {
        throw new Error( 'collector message must be an object' );
      }

      // PowerShell Collector 준비 완료 처리
      if (value.kind === 'READY') {
        console.log( `[${collectorName}] started. watchPath=${String(value.watchPath)}` );

        return;
      }

      if (value.kind !== 'FILE_RECORD') {
        throw new Error( 'unknown collector message' );
      }

      const { timestamp, changeType, path, sizeBytes } = value;

      // 필수 파일 수집값 검증
      if (
        typeof timestamp !== 'string' ||
        typeof changeType !== 'string' ||
        typeof path !== 'string'
      ) {
        throw new Error('invalid file record');
      }

      // 허용된 파일 변경 타입 검증
      if (
        changeType !== 'CREATED' &&
        changeType !== 'MODIFIED' &&
        changeType !== 'DELETED'
      ) {
        throw new Error( 'invalid file change type' );
      }

      const normalizedChangeType: WindowsFileChangeType = changeType;
      const debounceKey =
        `${normalizedChangeType}:${path.toLowerCase()}`;
      const currentTime = Date.now();
      const lastEventAt = lastEventAtByKey.get(debounceKey);

      // 동일 파일·동일 변경 타입의 연속 이벤트 제한
      if (
        lastEventAt !== undefined &&
        currentTime - lastEventAt < options.debounceMs
      ) {
        return;
      }

      lastEventAtByKey.set(debounceKey, currentTime);

      const record: WindowsFileRecord = {
        timestamp,
        changeType: normalizedChangeType,
        path,
      };

      // 확인 가능한 0 이상 파일 크기만 반영
      if (
        typeof sizeBytes === 'number' &&
        Number.isSafeInteger(sizeBytes) &&
        sizeBytes >= 0
      ) {
        record.sizeBytes = sizeBytes;
      }

      options.onRecord(record);
    },

    onFatalError: options.onFatalError,
  });
};