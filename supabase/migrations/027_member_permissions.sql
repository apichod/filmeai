-- Ajoute un champ permissions (JSONB) à organization_members
-- pour stocker les modules accessibles aux opérateurs.
-- Les admins ignorent ce champ (accès complet implicite).

ALTER TABLE organization_members
ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
