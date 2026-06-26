import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import type { WindowsNetworkFlowRecord } from '../events/networkFlowEvent.js';

// Windows Filtering Platform 연결 이벤트 설정
const NETWORK_FLOW_LOG_NAME = 'Security';
const NETWORK_FLOW_EVENT_ID = 5156;

interface StartNetworkFlowCollectorOptions {
  sourceIp: string;
  excludedDestinationIp: string;
  excludedDestinationPort: number;
  onRecord: (record: WindowsNetworkFlowRecord) => void;
  onFatalError: (error: Error) => void;
}

export interface WindowsNetworkFlowCollector {
  stop: () => void;
}

/**
 * 일반 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * PowerShell EncodedCommand 생성
 */
const encodePowerShellCommand = (script: string): string =>Buffer.from(script, 'utf16le').toString('base64');

/**
 * Windows Network Flow Event 구독 Script 생성
 */
const createCollectorScript = (
  options: Pick<
    StartNetworkFlowCollectorOptions,
    'sourceIp' | 'excludedDestinationIp' | 'excludedDestinationPort'
  >,
): string => String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$logName = '${NETWORK_FLOW_LOG_NAME}'
$eventId = ${NETWORK_FLOW_EVENT_ID}
$sourceIdentifier = 'OfficeGuardNetworkFlowWatcher'

try {
    # Security Event Log 접근 확인
    $null = Get-WinEvent -ListLog $logName -ErrorAction Stop

    # Event ID 5156 조회 조건 생성
    $queryText = "*[System[(EventID=$eventId)]]"

    # Network Flow Event 조회 객체 생성
    $query = [System.Diagnostics.Eventing.Reader.EventLogQuery]::new(
        $logName,
        [System.Diagnostics.Eventing.Reader.PathType]::LogName,
        $queryText
    )

    # 신규 Network Flow Event 감시 객체 생성
    $watcher = [System.Diagnostics.Eventing.Reader.EventLogWatcher]::new(
        $query,
        $null,
        $false
    )

    # 신규 Network Flow Event 처리
    $eventAction = {
        $eventException = $Event.SourceEventArgs.EventException

        # Event Log 감시 오류 처리
        if ($null -ne $eventException) {
            [Console]::Error.WriteLine(
                "[network-flow-collector] watcher error: " +
                $eventException.Message
            )
            return
        }

        $eventRecord = $Event.SourceEventArgs.EventRecord

        # 비어 있는 Event Record 제외
        if ($null -eq $eventRecord) {
            return
        }

        try {
            # Event Record XML 변환
            [xml]$eventXml = $eventRecord.ToXml()

            # EventData 이름과 값 매핑
            $eventData = @{}

            foreach ($dataElement in $eventXml.Event.EventData.Data) {
                $eventData[[string]$dataElement.Name] =
                    [string]$dataElement.'#text'
            }

            # Network Flow 주소 정보 조회
            $sourceAddress = [string]$eventData['SourceAddress']
            $destinationAddress = [string]$eventData['DestAddress']

            $destinationPort = 0
            $protocol = 0

            # 목적지 Port 숫자 변환
            if (-not [int]::TryParse(
                [string]$eventData['DestPort'],
                [ref]$destinationPort
            )) {
                return
            }

            # IP Protocol 번호 변환
            if (-not [int]::TryParse(
                [string]$eventData['Protocol'],
                [ref]$protocol
            )) {
                return
            }

            # 지정 Network Interface의 발신 연결만 처리
            if ($sourceAddress -ne '${options.sourceIp}') {
                return
            }

            # TCP 및 UDP 연결만 처리
            if ($protocol -ne 6 -and $protocol -ne 17) {
                return
            }

            # Agent Event Receiver 전송 연결 제외
            if (
                $destinationAddress -eq '${options.excludedDestinationIp}' -and
                $destinationPort -eq ${options.excludedDestinationPort}
            ) {
                return
            }

            # Node.js 전달용 Network Flow 기록 구성
            $message = [ordered]@{
                kind = 'NETWORK_FLOW_RECORD'
                recordId = [long]$eventRecord.RecordId
                timestamp = $eventRecord.TimeCreated.ToUniversalTime().ToString('o')
                sourceAddress = $sourceAddress
                destinationAddress = $destinationAddress
                destinationPort = $destinationPort
                protocol = $protocol
            }

            # Network Flow 기록 JSON 출력
            [Console]::Out.WriteLine(
                ($message | ConvertTo-Json -Compress)
            )
        }
        catch {
            # 개별 Event Record 변환 오류 처리
            [Console]::Error.WriteLine(
                "[network-flow-collector] event parse failed: " +
                $_.Exception.Message
            )
        }
        finally {
            # Event Record 리소스 해제
            $eventRecord.Dispose()
        }
    }

    # Network Flow Event 처리기 등록
    $eventParameters = @{
        InputObject = $watcher
        EventName = 'EventRecordWritten'
        SourceIdentifier = $sourceIdentifier
        Action = $eventAction
    }

    Register-ObjectEvent @eventParameters | Out-Null

    # Network Flow Event 감시 시작
    $watcher.Enabled = $true

    # Collector 준비 완료 메시지 구성
    $readyMessage = [ordered]@{
        kind = 'READY'
        logName = $logName
        eventId = $eventId
    }

    # Collector 준비 완료 JSON 출력
    [Console]::Out.WriteLine(
        ($readyMessage | ConvertTo-Json -Compress)
    )

    # Collector Process 실행 유지
    while ($true) {
        Start-Sleep -Milliseconds 500
    }
}
catch {
    # Collector 초기화 오류 처리
    [Console]::Error.WriteLine(
        "[network-flow-collector] startup failed: " +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # Event Log 감시 객체 정리
    if ($null -ne $watcher) {
        $watcher.Enabled = $false
        $watcher.Dispose()
    }

    # 등록된 Event 처리기 해제
    Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
}
`;

/**
 * Windows Network Flow 신규 이벤트 구독
 */
export const startWindowsNetworkFlowCollector = (
  options: StartNetworkFlowCollectorOptions,
): WindowsNetworkFlowCollector => {
  // Windows 실행 환경 검증
  if (process.platform !== 'win32') {
    throw new Error( '[network-flow-collector] Windows platform is required' );
  }

  // PowerShell Script 생성 및 Base64 인코딩
  const encodedCommand = encodePowerShellCommand( createCollectorScript(options) );

  let stopping = false;

  // Network Flow 수집용 PowerShell Process 실행
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

  // PowerShell 표준 출력 줄 단위 처리
  const outputLines = createInterface({ input: childProcess.stdout });

  outputLines.on('line', (line) => {
    if (line.trim() === '') {
      return;
    }

    try {
      // PowerShell JSON 메시지 변환
      const parsedValue: unknown = JSON.parse(line);

      // Collector 메시지 객체 형식 검증
      if (!isRecord(parsedValue)) {
        throw new Error('collector message must be an object');
      }

      // Collector 준비 완료 메시지 처리
      if (parsedValue.kind === 'READY') {
        console.log( `[network-flow-collector] started. logName=${String(parsedValue.logName)} eventId=${String(parsedValue.eventId)}` );
        return;
      }

      // Network Flow 기록 외 메시지 차단
      if (parsedValue.kind !== 'NETWORK_FLOW_RECORD') {
        throw new Error('unknown collector message');
      }

      const {
        recordId,
        timestamp,
        sourceAddress,
        destinationAddress,
        destinationPort,
        protocol,
      } = parsedValue;

      // Network Flow 기록 필드 형식 검증
      if (
        typeof recordId !== 'number' ||
        typeof timestamp !== 'string' ||
        typeof sourceAddress !== 'string' ||
        typeof destinationAddress !== 'string' ||
        typeof destinationPort !== 'number' ||
        typeof protocol !== 'number'
      ) {
        throw new Error('invalid Network Flow record message');
      }

      // 검증 완료 Network Flow 기록 전달
      options.onRecord({
        recordId,
        timestamp,
        sourceAddress,
        destinationAddress,
        destinationPort,
        protocol,
      });
    } catch (error) {
      // PowerShell 출력 메시지 변환 오류 처리
      console.error( '[network-flow-collector] invalid output:', error );
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
      new Error( `[network-flow-collector] process exited unexpectedly. code=${String(code)} signal=${String(signal)}` ),
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