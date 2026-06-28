import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

interface StartPowerShellJsonLineCollectorOptions {
  collectorName: string;
  script: string;
  onValue: (value: unknown) => void;
  onFatalError: (error: Error) => void;
}

/**
 * PowerShell Collector 제어 인터페이스
 */
export interface PowerShellJsonLineCollector {
  stop: () => void;
}

/**
 * PowerShell EncodedCommand 생성
 */
const encodePowerShellCommand = (script: string): string =>
  Buffer.from(script, 'utf16le').toString('base64');

/**
 * PowerShell 단일 인용 문자열 Escape
 */
export const escapePowerShellSingleQuotedString = (value: string): string =>
  value.replaceAll("'", "''");

/**
 * PowerShell JSON Line Collector 실행
 */
export const startPowerShellJsonLineCollector = (
  options: StartPowerShellJsonLineCollectorOptions,
): PowerShellJsonLineCollector => {
  // Windows 전용 Collector 실행 환경 검증
  if (process.platform !== 'win32') {
    throw new Error( `[${options.collectorName}] Windows platform is required` );
  }

  // PowerShell Script의 UTF-16LE Base64 변환
  const encodedCommand = encodePowerShellCommand(options.script);

  let stopping = false;
  let fatalErrorReported = false;

  // PowerShell Child Process 실행
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
    { windowsHide: true },
  );

  // 표준 출력의 JSON Line 단위 처리
  const outputLines = createInterface({
    input: childProcess.stdout,
    crlfDelay: Infinity,
  });

  outputLines.on('line', (line) => {
    const normalizedLine = line.trim();

    if (normalizedLine === '') {
      return;
    }

    try {
      // PowerShell JSON 출력의 unknown 타입 유지
      const value: unknown = JSON.parse(normalizedLine);

      // Collector별 출력값 처리
      options.onValue(value);
    } catch (error) {
      console.error( `[${options.collectorName}] invalid output. line=${normalizedLine}`, error );
    }
  });

  // PowerShell 오류 출력 처리
  childProcess.stderr.setEncoding('utf8');

  childProcess.stderr.on('data', (chunk: string) => {
    const message = chunk.trim();

    if (message === '' || message === '#< CLIXML') {
      return;
    }

    console.error( `[${options.collectorName}] ${message}` );
  });

  // Child Process 실행 실패 처리
  childProcess.once('error', (error) => {
    if (stopping || fatalErrorReported) {
      return;
    }

    // 치명적 오류 중복 보고 차단
    fatalErrorReported = true;
    options.onFatalError(error);
  });

  // 비정상 Child Process 종료 처리
  childProcess.once('exit', (code, signal) => {
    outputLines.close();

    if (stopping || fatalErrorReported || code === 0) {
      return;
    }

    // error와 exit 이벤트의 중복 보고 차단
    fatalErrorReported = true;

    options.onFatalError(
      new Error( `[${options.collectorName}] process exited. code=${String(code)} signal=${String(signal)}` ),
    );
  });

  return {
    stop: () => {
      if (stopping) {
        return;
      }

      // 정상 종료 상태 전환
      stopping = true;

      // 표준 출력 Reader와 Child Process 종료
      outputLines.close();
      childProcess.kill();
    },
  };
};