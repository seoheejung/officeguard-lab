import type { WindowsUsbDeviceRecord } from '../events/endpointEvent.js';
import {
  startPowerShellJsonLineCollector,
  type PowerShellJsonLineCollector,
} from './powerShellJsonLineCollector.js';

interface StartWindowsUsbCollectorOptions {
  onRecord: (record: WindowsUsbDeviceRecord) => void;
  onFatalError: (error: Error) => void;
}

export type WindowsUsbCollector = PowerShellJsonLineCollector;

/**
 * 일반 JSON 객체 여부 확인
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * USB 저장 장치 상태 감지 Script
 */
const USB_COLLECTOR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$sourceIdentifier = 'OfficeGuardDeviceChangeWatcher'

function Get-UsbDiskSnapshot {
    $snapshot = @{}

    # 현재 연결된 USB 물리 디스크 조회
    $disks = Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction Stop |
        Where-Object {
            $_.InterfaceType -eq 'USB'
        }

    foreach ($disk in $disks) {
        $deviceKey = $null

        # 장치 상태 비교용 식별값 결정
        if (-not [string]::IsNullOrWhiteSpace([string]$disk.SerialNumber)) {
            $deviceKey = ([string]$disk.SerialNumber).Trim()
        }
        elseif (-not [string]::IsNullOrWhiteSpace([string]$disk.PNPDeviceID)) {
            $deviceKey = [string]$disk.PNPDeviceID
        }
        else {
            $deviceKey = [string]$disk.DeviceID
        }

        $driveLetters = @()

        try {
            # 물리 디스크와 파티션 연결 관계 조회
            $partitions = Get-CimAssociatedInstance -InputObject $disk -Association Win32_DiskDriveToDiskPartition -ResultClassName Win32_DiskPartition -ErrorAction Stop

            foreach ($partition in $partitions) {
                # 파티션과 논리 드라이브 연결 관계 조회
                $logicalDisks = Get-CimAssociatedInstance -InputObject $partition -Association Win32_LogicalDiskToPartition -ResultClassName Win32_LogicalDisk -ErrorAction Stop

                foreach ($logicalDisk in $logicalDisks) {
                    if (
                        -not [string]::IsNullOrWhiteSpace(
                            [string]$logicalDisk.DeviceID
                        )
                    ) {
                        $driveLetters += ([string]$logicalDisk.DeviceID + '\')
                    }
                }
            }
        }
        catch {
            # 드라이브 문자 확인 실패 시 빈 목록 유지
            $driveLetters = @()
        }

        # 장치별 Snapshot 저장
        $snapshot[$deviceKey] = [ordered]@{
            deviceKey = $deviceKey
            vendor = [string]$disk.Manufacturer
            productName = [string]$disk.Model
            driveLetters = [string[]]@(
                $driveLetters | Sort-Object -Unique
            )
        }
    }

    return $snapshot
}

try {
    # Agent 시작 시 초기 USB 상태 저장
    $currentSnapshot = Get-UsbDiskSnapshot
    $query = 'SELECT * FROM Win32_DeviceChangeEvent'

    # Windows 장치 변경 이벤트 구독
    Register-CimIndicationEvent -Query $query -SourceIdentifier $sourceIdentifier | Out-Null

    # Collector 준비 완료 출력
    $readyMessage = [ordered]@{
        kind = 'READY'
        source = 'Win32_DeviceChangeEvent'
        initialDeviceCount = $currentSnapshot.Count
    }

    [Console]::Out.WriteLine(
        ($readyMessage | ConvertTo-Json -Compress -Depth 5)
    )

    while ($true) {
        # 장치 상태 변경 이벤트 대기
        $event = Wait-Event -SourceIdentifier $sourceIdentifier -Timeout 1

        if ($null -eq $event) {
            continue
        }

        try {
            # Windows 장치 매핑 완료 대기
            Start-Sleep -Milliseconds 1000

            $nextSnapshot = Get-UsbDiskSnapshot

            # 새로 연결된 USB 저장 장치 확인
            foreach ($deviceKey in $nextSnapshot.Keys) {
                if ($currentSnapshot.ContainsKey($deviceKey)) {
                    continue
                }

                $device = $nextSnapshot[$deviceKey]

                $message = [ordered]@{
                    kind = 'USB_DEVICE_RECORD'
                    timestamp = [DateTime]::UtcNow.ToString('o')
                    changeType = 'CONNECTED'
                    deviceKey = $device.deviceKey
                    vendor = $device.vendor
                    productName = $device.productName
                    driveLetters = [string[]]@($device.driveLetters)
                }

                [Console]::Out.WriteLine(
                    ($message | ConvertTo-Json -Compress -Depth 5)
                )
            }

            # 연결 해제된 USB 저장 장치 확인
            foreach ($deviceKey in $currentSnapshot.Keys) {
                if ($nextSnapshot.ContainsKey($deviceKey)) {
                    continue
                }

                $device = $currentSnapshot[$deviceKey]

                $message = [ordered]@{
                    kind = 'USB_DEVICE_RECORD'
                    timestamp = [DateTime]::UtcNow.ToString('o')
                    changeType = 'DISCONNECTED'
                    deviceKey = $device.deviceKey
                    vendor = $device.vendor
                    productName = $device.productName
                    driveLetters = [string[]]@($device.driveLetters)
                }

                [Console]::Out.WriteLine(
                    ($message | ConvertTo-Json -Compress -Depth 5)
                )
            }

            # 다음 장치 변경 비교용 Snapshot 갱신
            $currentSnapshot = $nextSnapshot
        }
        catch {
            [Console]::Error.WriteLine(
                '[usb-collector] snapshot comparison failed: ' +
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
        '[usb-collector] startup failed: ' +
        $_.Exception.Message
    )

    exit 1
}
finally {
    # 장치 변경 이벤트 구독 해제
    Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
}
`;

/**
 * Windows USB 저장 장치 상태 감지
 */
export const startWindowsUsbCollector = (
  options: StartWindowsUsbCollectorOptions,
): WindowsUsbCollector =>
  startPowerShellJsonLineCollector({
    collectorName: 'usb-collector',
    script: USB_COLLECTOR_SCRIPT,

    onValue: (value) => {
      if (!isRecord(value)) {
        throw new Error( 'collector message must be an object') ;
      }

      // PowerShell Collector 준비 완료 처리
      if (value.kind === 'READY') {
        console.log( `[usb-collector] started. source=${String(value.source)} initialDeviceCount=${String(value.initialDeviceCount)}` );

        return;
      }

      if (value.kind !== 'USB_DEVICE_RECORD') {
        throw new Error( 'unknown collector message' );
      }

      const {
        timestamp,
        changeType,
        deviceKey,
        vendor,
        productName,
        driveLetters,
      } = value;

      // 필수 USB 장치 수집값 검증
      if (
        typeof timestamp !== 'string' ||
        typeof changeType !== 'string' ||
        typeof deviceKey !== 'string' ||
        !Array.isArray(driveLetters)
      ) {
        throw new Error( 'invalid USB device record' );
      }

      // 허용된 USB 상태 변경 타입 검증
      if (changeType !== 'CONNECTED' && changeType !== 'DISCONNECTED') {
        throw new Error( 'invalid USB change type') ;
      }

      // Windows 드라이브 루트 형식만 반영
      const validDriveLetters = driveLetters.filter(
        (driveLetter): driveLetter is string =>
          typeof driveLetter === 'string' && /^[A-Za-z]:\\$/.test(driveLetter),
      );

      const record: WindowsUsbDeviceRecord = {
        timestamp,
        changeType,
        deviceKey,
        driveLetters: validDriveLetters,
      };

      // 확인 가능한 장치 제조사만 반영
      if (typeof vendor === 'string' && vendor.trim() !== '') {
        record.vendor = vendor.trim();
      }

      // 확인 가능한 장치 모델명만 반영
      if (typeof productName === 'string' && productName.trim() !== '') {
        record.productName = productName.trim();
      }

      options.onRecord(record);
    },

    onFatalError: options.onFatalError,
  });