import { readdir, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

interface WaitForStableFileOptions {
  destinationPath: string;
  intervalMs: number;
  maxAttempts: number;
}

interface FindSourceFileCandidateOptions {
  sourceRoot: string;
  destinationPath: string;
  destinationSizeBytes: number;
}

/**
 * 파일 상태 Snapshot
 */
interface FileSnapshot {
  sizeBytes: number;
  modifiedAtMs: number;
}

/**
 * 지정 시간 대기
 */
const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
};

/**
 * 대상 파일 상태 조회
 */
const readFileSnapshot = async (
  destinationPath: string,
): Promise<FileSnapshot | undefined> => {
  try {
    const fileStat = await stat(destinationPath);

    if (!fileStat.isFile()) {
      return undefined;
    }

    return {
      sizeBytes: fileStat.size,
      modifiedAtMs: fileStat.mtimeMs,
    };
  } catch {
    return undefined;
  }
};

/**
 * USB 대상 파일 쓰기 완료 대기
 */
export const waitForStableFile = async (
  options: WaitForStableFileOptions,
): Promise<number | undefined> => {
  let previousSnapshot: FileSnapshot | undefined;
  let stableMatchCount = 0;

  for (
    let attempt = 1;
    attempt <= options.maxAttempts;
    attempt += 1
  ) {
    const currentSnapshot = await readFileSnapshot(
      options.destinationPath,
    );

    if (currentSnapshot === undefined) {
      // 파일 접근 실패 시 안정화 상태 초기화
      previousSnapshot = undefined;
      stableMatchCount = 0;
    } else if (
      previousSnapshot !== undefined &&
      previousSnapshot.sizeBytes === currentSnapshot.sizeBytes &&
      previousSnapshot.modifiedAtMs === currentSnapshot.modifiedAtMs
    ) {
      stableMatchCount += 1;

      // 세 번 연속 동일 상태 확인
      if (stableMatchCount >= 2) {
        return currentSnapshot.sizeBytes;
      }
    } else {
      // 변경된 파일 상태 기준 갱신
      previousSnapshot = currentSnapshot;
      stableMatchCount = 0;
    }

    if (attempt < options.maxAttempts) {
      await delay(options.intervalMs);
    }
  }

  return undefined;
};

/**
 * 감시 경로의 원본 파일 후보 탐색
 */
const findCandidates = async (
  directoryPath: string,
  targetFileName: string,
  destinationSizeBytes: number,
  candidates: string[],
): Promise<void> => {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    // 단일 후보 확정 불가 시 추가 탐색 중단
    if (candidates.length > 1) {
      return;
    }

    const entryPath = join(directoryPath, entry.name);

    // 감시 경로 외부 탐색 방지를 위한 심볼릭 링크 제외
    if (entry.isSymbolicLink()) {
      continue;
    }

    // 하위 디렉터리 재귀 탐색
    if (entry.isDirectory()) {
      await findCandidates(
        entryPath,
        targetFileName,
        destinationSizeBytes,
        candidates,
      );

      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    // 대상 파일명과 동일한 후보만 처리
    if (entry.name.toLowerCase() !== targetFileName.toLowerCase()) {
      continue;
    }

    try {
      const fileStat = await stat(entryPath);

      // 안정화 완료 대상 파일과 크기 비교
      if (fileStat.size !== destinationSizeBytes) {
        continue;
      }
    } catch {
      // 탐색 중 제거되거나 접근할 수 없는 파일 제외
      continue;
    }

    candidates.push(resolve(entryPath));
  }
};

/**
 * USB 대상 파일의 단일 원본 후보 확인
 */
export const findSourceFileCandidate = async (
  options: FindSourceFileCandidateOptions,
): Promise<string | undefined> => {
  const targetFileName = basename(options.destinationPath);

  if (targetFileName === '') {
    return undefined;
  }

  const candidates: string[] = [];

  try {
    // 파일명과 최종 크기가 일치하는 원본 후보 탐색
    await findCandidates(
      options.sourceRoot,
      targetFileName,
      options.destinationSizeBytes,
      candidates,
    );
  } catch (error) {
    console.error( '[source-file-matcher] source search failed:', error );

    return undefined;
  }

  // 원본 후보가 정확히 한 건인 경우만 반환
  if (candidates.length !== 1) {
    return undefined;
  }

  return candidates[0];
};