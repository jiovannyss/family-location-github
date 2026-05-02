-- Quick predefined messages between circle members
CREATE TABLE public.messages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    circle_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    recipient_id UUID NOT NULL,
    -- Type of payload: 'question' or 'answer'
    kind TEXT NOT NULL CHECK (kind IN ('question', 'answer')),
    -- Predefined code, e.g. 'q1', 'q2', 'q3', 'a1_1', 'a1_2', 'a2_1', 'a2_2', 'a3_ack'
    code TEXT NOT NULL,
    -- The text shown (denormalized for history stability)
    body TEXT NOT NULL,
    -- For answers: link back to the question being answered
    in_reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_recipient ON public.messages(recipient_id, created_at DESC);
CREATE INDEX idx_messages_circle ON public.messages(circle_id, created_at DESC);
CREATE INDEX idx_messages_in_reply ON public.messages(in_reply_to);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- A user can see a message if they are sender or recipient AND both are accepted members of the circle
CREATE POLICY "Users can view their own messages in shared circles"
ON public.messages
FOR SELECT
TO authenticated
USING (
    (sender_id = auth.uid() OR recipient_id = auth.uid())
    AND public.is_circle_member(sender_id, circle_id)
    AND public.is_circle_member(recipient_id, circle_id)
);

-- Sender can insert if they are an accepted member of the circle and recipient is too
CREATE POLICY "Users can send messages to circle mates"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender_id = auth.uid()
    AND sender_id <> recipient_id
    AND public.is_circle_member(auth.uid(), circle_id)
    AND public.is_circle_member(recipient_id, circle_id)
);

-- Recipient can mark messages as read; sender can delete their own
CREATE POLICY "Recipient can update read state"
ON public.messages
FOR UPDATE
TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "Sender or recipient can delete"
ON public.messages
FOR DELETE
TO authenticated
USING (sender_id = auth.uid() OR recipient_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.messages REPLICA IDENTITY FULL;