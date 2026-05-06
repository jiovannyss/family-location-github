CREATE TABLE public.diagnostic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id text NOT NULL,
  platform text NOT NULL,
  source text NOT NULL,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'info',
  flow_id text,
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.diagnostic_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own diagnostic events"
ON public.diagnostic_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own diagnostic events"
ON public.diagnostic_events
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own diagnostic events"
ON public.diagnostic_events
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX diagnostic_events_user_created_idx
ON public.diagnostic_events (user_id, created_at DESC);

CREATE INDEX diagnostic_events_device_created_idx
ON public.diagnostic_events (device_id, created_at DESC);

CREATE INDEX diagnostic_events_flow_idx
ON public.diagnostic_events (flow_id, created_at DESC);