/**
 * Return the next monotonic state version without crossing JavaScript's
 * exact-integer range. Call before mutating the state so failure is atomic.
 */
export function nextStateVersion(currentVersion: number): number {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1) {
    throw new Error('当前状态版本不是有效的正安全整数。')
  }
  if (currentVersion >= Number.MAX_SAFE_INTEGER) {
    throw new Error('状态版本已达到 JavaScript 安全整数上限，无法继续修改。请恢复原始样例后重新导入。')
  }

  const nextVersion = currentVersion + 1
  if (!Number.isSafeInteger(nextVersion)) {
    throw new Error('下一个状态版本超出 JavaScript 安全整数范围。')
  }
  return nextVersion
}
