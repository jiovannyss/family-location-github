import { supabase } from '@/integrations/supabase/client';
import { getDeviceIdAsync } from './deviceId';
import { getDeviceInfo } from './device';

export type DiagnosticStatus = 'info' | 'success' | 'warning' | 'error';

export interface DiagnosticEvent {
  id: string;
  user_id: string;
  device_id: string;
  platform: string;
  source: string;
  stage: string;
  status: DiagnosticStatus;
  flow_id: string | null;
  message: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

interface LogDiagnosticInput {
  userId?: string | null;
  deviceId?: string;
  platform?: string;
  source: string;
  stage: string;
  status?: DiagnosticStatus;
  flowId?: string | null;
  message?: string;
  details?: Record<string, unknown>;
}

function sanitizeDetails(details?: Record<string, unknown>) {
  if (!details) return {};
  try {
    return JSON.parse(JSON.stringify(details)) as Record<string, unknown>;
  } catch {
    return { serialization_error: true };
  }
}

export function createFlowId(prefix = 'flow') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function resolveUserId(userId?: string | null) {
  if (userId) return userId;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function logDiagnosticEvent(input: LogDiagnosticInput) {
  const userId = await resolveUserId(input.userId);
  const details = sanitizeDetails(input.details);

  console.log('[diag]', {
    source: input.source,
    stage: input.stage,
    status: input.status ?? 'info',
    flowId: input.flowId ?? null,
    message: input.message ?? null,
    details,
  });

  if (!userId) return null;

  const deviceId = input.deviceId ?? await getDeviceIdAsync();
  const platform = input.platform ?? getDeviceInfo().platform;

  const { data, error } = await supabase
    .from('diagnostic_events')
    .insert({
      user_id: userId,
      device_id: deviceId,
      platform,
      source: input.source,
      stage: input.stage,
      status: input.status ?? 'info',
      flow_id: input.flowId ?? null,
      message: input.message ?? null,
      details,
    })
    .select()
    .single();

  if (error) {
    console.warn('[diag] failed to persist diagnostic event', error);
    return null;
  }

  return data as DiagnosticEvent;
}