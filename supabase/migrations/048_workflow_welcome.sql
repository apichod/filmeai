-- Ajoute welcome (message d'accueil du chat) et parent_category (catégorie niveau 1)
-- aux workflows retours

ALTER TABLE return_workflows
  ADD COLUMN IF NOT EXISTS welcome         text,
  ADD COLUMN IF NOT EXISTS parent_category text;

-- Seed : renseigne parent_category + welcome depuis les valeurs hardcodées
-- dans LEVEL2_MAP de returns/page.tsx

UPDATE return_workflows SET
  parent_category = 'retard',
  welcome = 'Tâche : Créer un dossier de retard (R11-21).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r11_21_late_open';

UPDATE return_workflows SET
  parent_category = 'retard',
  welcome = 'Tâche : Régulariser un retard et gracier (R11-22).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r11_22_late_waived';

UPDATE return_workflows SET
  parent_category = 'retard',
  welcome = 'Tâche : Régulariser un retard et débiter la caution (R11-23).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r11_23_late_deposit';

UPDATE return_workflows SET
  parent_category = 'retard',
  welcome = 'Tâche : Régulariser un retard et facturer le client (R11-24).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r11_24_late_billed';

UPDATE return_workflows SET
  parent_category = 'perte',
  welcome = 'Tâche : Créer un dossier de perte (R12-21).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r12_21_missing_open';

UPDATE return_workflows SET
  parent_category = 'perte',
  welcome = 'Tâche : Clôturer un dossier de perte et gracier (R12-22).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r12_22_missing_waived';

UPDATE return_workflows SET
  parent_category = 'perte',
  welcome = 'Tâche : Clôturer un dossier de perte par débit de caution (R12-23).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r12_23_missing_deposit';

UPDATE return_workflows SET
  parent_category = 'perte',
  welcome = 'Tâche : Clôturer un dossier de perte par facturation (R12-24).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r12_24_missing_billed';

UPDATE return_workflows SET
  parent_category = 'vol',
  welcome = 'Tâche : Créer un dossier de vol (R13-21).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r13_21_theft_open';

UPDATE return_workflows SET
  parent_category = 'vol',
  welcome = 'Tâche : Clôturer un dossier de vol et gracier (R13-22).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r13_22_theft_waived';

UPDATE return_workflows SET
  parent_category = 'vol',
  welcome = 'Tâche : Clôturer un dossier de vol par débit de caution (R13-23).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r13_23_theft_deposit';

UPDATE return_workflows SET
  parent_category = 'vol',
  welcome = 'Tâche : Clôturer un dossier de vol par facturation (R13-24).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r13_24_theft_billed';

UPDATE return_workflows SET
  parent_category = 'dommage',
  welcome = 'Tâche : Créer un dossier de dommage (R14-21).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r14_21_damage_open';

UPDATE return_workflows SET
  parent_category = 'dommage',
  welcome = 'Tâche : Clôturer un dossier de dommage et gracier (R14-22).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r14_22_damage_waived';

UPDATE return_workflows SET
  parent_category = 'dommage',
  welcome = 'Tâche : Clôturer un dossier de dommage par débit de caution (R14-23).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r14_23_damage_deposit';

UPDATE return_workflows SET
  parent_category = 'dommage',
  welcome = 'Tâche : Clôturer un dossier de dommage par facturation (R14-24).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'r14_24_damage_billed';

UPDATE return_workflows SET
  parent_category = 'split',
  welcome = 'Tâche : Séparer 2 problèmes sur la même commande (U01).' || E'\n' || 'Donnez-moi le numéro de la commande d''origine.'
WHERE slug = 'u01_split_return_order';
