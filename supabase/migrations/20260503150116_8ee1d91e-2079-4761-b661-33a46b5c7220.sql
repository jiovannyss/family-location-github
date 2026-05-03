-- Премахни дубликати ако има, запазвайки най-новия запис
DELETE FROM public.push_tokens a
USING public.push_tokens b
WHERE a.user_id = b.user_id
  AND a.device_id = b.device_id
  AND a.updated_at < b.updated_at;

-- Добави unique constraint за onConflict target
ALTER TABLE public.push_tokens
ADD CONSTRAINT push_tokens_user_device_unique UNIQUE (user_id, device_id);