-- Add "doctor_reviewed" (purple) workflow step before "delivered" on I-693 Kanban.

ALTER TABLE public.immigration_cases
  DROP CONSTRAINT IF EXISTS immigration_cases_status_check;

ALTER TABLE public.immigration_cases
  ADD CONSTRAINT immigration_cases_status_check CHECK (
    status IN ('incomplete', 'ready_review', 'completed', 'doctor_reviewed', 'delivered')
  );

ALTER TABLE public.immigration_cases
  DROP CONSTRAINT IF EXISTS immigration_cases_status_color_check;

ALTER TABLE public.immigration_cases
  ADD CONSTRAINT immigration_cases_status_color_check CHECK (
    status_color IN ('red', 'yellow', 'purple', 'green', 'blue')
  );
