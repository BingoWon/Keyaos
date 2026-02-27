-- Add input/output modality arrays to model_pricing
ALTER TABLE model_pricing ADD COLUMN input_modalities TEXT NOT NULL DEFAULT '["text"]';
ALTER TABLE model_pricing ADD COLUMN output_modalities TEXT NOT NULL DEFAULT '["text"]';
