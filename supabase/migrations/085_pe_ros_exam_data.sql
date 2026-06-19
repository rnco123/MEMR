-- Add structured ROS / EXAM JSONB column to physical examinations table.
-- Legacy text columns (general_appearance, etc.) are preserved for existing data.

ALTER TABLE public.encounter_physical_examinations
  ADD COLUMN IF NOT EXISTS ros_exam_data JSONB;

COMMENT ON COLUMN public.encounter_physical_examinations.ros_exam_data IS
  'Structured ROS + Physical Exam data: { ros: { cons, skin, eyes, ... }, exam: { general, skin, head, ... }, remarks }.
   Status values per system: "N" (Normal), "A" (Abnormal), "NA" (Not Applicable), null (not recorded).
   Some systems carry free-text sub-fields (e.g. gyn_lmp, neu_numbness, ms_sites).';
