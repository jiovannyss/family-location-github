/**
 * Centralized API for member-to-member messages.
 */
import { supabase } from '@/integrations/supabase/client';

export type MessageKind = 'question' | 'answer';

export interface MessageRow {
  id: string;
  circle_id: string;
  sender_id: string;
  recipient_id: string;
  kind: MessageKind;
  code: string;
  body: string;
  in_reply_to: string | null;
  read_at: string | null;
  created_at: string;
}

export interface SendMessageInput {
  circleId: string;
  senderId: string;
  recipientId: string;
  kind: MessageKind;
  code: string;
  body: string;
  inReplyTo?: string | null;
}

export async function sendMessageApi(input: SendMessageInput): Promise<MessageRow> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      circle_id: input.circleId,
      sender_id: input.senderId,
      recipient_id: input.recipientId,
      kind: input.kind,
      code: input.code,
      body: input.body,
      in_reply_to: input.inReplyTo ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MessageRow;
}

/**
 * Fan-out: send the same predefined message to a recipient in EVERY circle the
 * sender shares with them. The DB schema enforces (sender_id, recipient_id,
 * circle_id) membership via RLS.
 */
export async function sendToAllSharedCirclesApi(args: {
  senderId: string;
  recipientId: string;
  sharedCircleIds: string[];
  kind: MessageKind;
  code: string;
  body: string;
  inReplyTo?: string | null;
}): Promise<MessageRow[]> {
  if (args.sharedCircleIds.length === 0) return [];
  const rows = args.sharedCircleIds.map((cid) => ({
    circle_id: cid,
    sender_id: args.senderId,
    recipient_id: args.recipientId,
    kind: args.kind,
    code: args.code,
    body: args.body,
    in_reply_to: args.inReplyTo ?? null,
  }));
  const { data, error } = await supabase.from('messages').insert(rows).select();
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function listInboxApi(userId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as MessageRow[];
}

export async function markReadApi(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}
