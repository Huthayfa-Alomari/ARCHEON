export type ReachTier = 0 | 1 | 2;
export type ReachStatus = "ok" | "warn" | "off" | "error";

export type ReachBackend = {
  id: string;
  command?: string;
  versionArgs?: string[];
  description: string;
};

export type ReachChannel = {
  name: string;
  description: string;
  tier: ReachTier;
  backends: ReachBackend[];
  hosts?: string[];
};

export type ReachProbe = {
  channel: string;
  status: ReachStatus;
  activeBackend: string | null;
  attempted: Array<{ backend: string; status: string; detail?: string }>;
};
