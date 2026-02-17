/**
 * Stable thread id for a 1:1 conversation between two users.
 */
export function getThreadId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join("_");
}
