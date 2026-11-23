export type CooldownReason = "quota_exhausted" | "rate_limited" | "auth_error";

type CooldownEntry = {
  until: number;
  reason: CooldownReason;
  detail?: string;
};

const cooldowns = new Map<string, CooldownEntry>();

export function markCooldown(
  accountId: string,
  reason: CooldownReason,
  durationMs: number,
  detail?: string,
): void {
  if (durationMs <= 0) return;
  cooldowns.set(accountId, {
    until: Date.now() + durationMs,
    reason,
    detail,
  });
}

export function activeCooldown(accountId: string): CooldownEntry | undefined {
  const entry = cooldowns.get(accountId);
  if (!entry) return undefined;
  if (entry.until <= Date.now()) {
    cooldowns.delete(accountId);
    return undefined;
  }
  return entry;
}

export function clearCooldown(accountId: string): void {
  cooldowns.delete(accountId);
}

export function listCooldowns(): Array<{
  accountId: string;
  reason: CooldownReason;
  until: string;
  detail?: string;
}> {
  const now = Date.now();
  const active: Array<{
    accountId: string;
    reason: CooldownReason;
    until: string;
    detail?: string;
  }> = [];
  for (const [accountId, entry] of cooldowns) {
    if (entry.until <= now) {
      cooldowns.delete(accountId);
      continue;
    }
    active.push({
      accountId,
      reason: entry.reason,
      until: new Date(entry.until).toISOString(),
      detail: entry.detail,
    });
  }
  return active;
}
