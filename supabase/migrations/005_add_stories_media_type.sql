-- Add media_type column to stories table
ALTER TABLE public.stories ADD COLUMN media_type text DEFAULT 'image';

-- Update any existing null values
UPDATE public.stories SET media_type = 'image' WHERE media_type IS NULL;

-- Add not null constraint
ALTER TABLE public.stories ALTER COLUMN media_type SET DEFAULT 'image';