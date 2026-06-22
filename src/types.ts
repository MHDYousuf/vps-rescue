export interface SshTarget {
  user: string;
  host: string;
  port: number;
}

export interface TailscaleDevice {
  id: string;
  nodeId: string;
  name: string;
  hostname: string;
  addresses: string[];
  os: string;
  tags?: string[];
  lastSeen: string;
  created: string;
  authorized: boolean;
}

export interface TailscaleAuthKey {
  id: string;
  key: string;
  expires: string;
}

export type DiagnosisVerdict =
  | "reachable"
  | "isp_blocked"
  | "path_blocked"
  | "dns_failure"
  | "host_offline"
  | "unknown";

export interface DiagnosisResult {
  verdict: DiagnosisVerdict;
  details: string[];
  lastReachableHop?: string;
  resolvedIp?: string;
}
