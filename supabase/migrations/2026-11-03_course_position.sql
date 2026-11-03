-- Course order chosen by the teacher (Classroom "Earlier" / "Later"). The
-- Classroom and the About page list courses by position; a course without one
-- comes first, newest first, so nothing moves until a teacher reorders.
--
-- Safe to run more than once.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS position integer;

COMMENT ON COLUMN courses.position IS 'Order chosen by the teacher, 1 first. NULL until they reorder; NULLs sort first, newest first.';
