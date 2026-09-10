-- Guarda qué plantilla de contrato eligió el profesional al cotizar
-- (ver scripts/contract-templates.js). Es solo un dato de presentación
-- (cambia una frase de la sección OBJETO, no el contenido legal) -- por
-- eso vive en "quotes" y no dentro del payload hasheado de
-- contrato_versiones, así no afecta la reconciliación por hash.
ALTER TABLE public.quotes
  ADD COLUMN template_id text CHECK (template_id IS NULL OR template_id IN ('obra-nueva', 'refaccion'));
