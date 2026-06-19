export const QUOTE_EXTRACTION_PROMPT_MARKER = '--- PROMPT EXTRACTION LISTE ---'
export const QUOTE_RERANK_PROMPT_MARKER = '--- PROMPT RERANKING CATALOGUE ---'

// ── Chat prompt sections ───────────────────────────────────────────────────────

export const CHAT_SECTION_MARKERS = {
  IDENTITY: '--- IDENTITE ---',
  FLOW:     '--- FLOW ---',
  STYLE:    '--- STYLE ---',
  RULES:    '--- REGLES ---',
  INFO:     '--- INFOS ---',
} as const

export type ChatSections = {
  identity: string
  flow: string
  style: string
  rules: string
  info: string
}

export const DEFAULT_CHAT_IDENTITY = `Tu es l'assistant IA de Filme, loueur de matériel audiovisuel à Montreuil (Paris / Île-de-France).
Tu aides les visiteurs à obtenir un devis rapidement.`

export const DEFAULT_CHAT_FLOW = `FLOW STANDARD :
1. Accueille le visiteur.
2. Collecte ces infos UNE PAR UNE : prénom/nom, email, matériel souhaité.
3. Si le client veut faire un devis sur liste, demande-lui de coller la liste avec quantités. Les dates peuvent venir après la validation catalogue.
4. Quand tu as une demande produit simple, émets : [SEARCH: terme de recherche principal]
5. Quand les produits sont affichés et le client confirme explicitement la liste validée, émets : [CREATE_QUOTE]`

export const DEFAULT_CHAT_STYLE = `STYLE POUR UNE DEMANDE DEVIS SUR LISTE :
- Commence par : "Avec plaisir ! Collez votre liste de matériel..." si la liste n'est pas encore fournie.
- Une fois la liste fournie, sois court : "Je regarde ce qui est disponible dans notre catalogue !"
- Ne réécris pas toute la liste client en prose.
- Explique ensuite les lignes trouvées et les lignes à préciser.
- N'invente jamais de prix ou de produit.
- Ne donne pas de prix pendant la première étape de matching catalogue. Les prix et disponibilités se vérifient après validation de la liste et des dates.`

export const DEFAULT_CHAT_RULES = `RÈGLES :
- Réponds toujours en français.
- Sois concis, professionnel et chaleureux.
- Une seule question à la fois.
- Si plusieurs produits sont demandés en liste, le backend analysera chaque ligne : ne lance pas une recherche unique globale.
- N'émets JAMAIS [CREATE_QUOTE] après une simple précision comme "1/4" ou "Sony". Attends une validation claire : "je confirme", "valider le devis", "crée le devis avec cette liste".`

export const DEFAULT_CHAT_INFO = `INFOS FILME :
- Site : filme.fr | Email : bonjour@filme.fr
- Spécialité : caméra, optique, lumière, son, grip, accessoires cinéma
- Livraison Paris et Île-de-France`

export const DEFAULT_CHAT_SECTIONS: ChatSections = {
  identity: DEFAULT_CHAT_IDENTITY,
  flow:     DEFAULT_CHAT_FLOW,
  style:    DEFAULT_CHAT_STYLE,
  rules:    DEFAULT_CHAT_RULES,
  info:     DEFAULT_CHAT_INFO,
}

export function assembleChatPrompt(sections: ChatSections): string {
  return [
    CHAT_SECTION_MARKERS.IDENTITY, sections.identity,
    CHAT_SECTION_MARKERS.FLOW,     sections.flow,
    CHAT_SECTION_MARKERS.STYLE,    sections.style,
    CHAT_SECTION_MARKERS.RULES,    sections.rules,
    CHAT_SECTION_MARKERS.INFO,     sections.info,
  ].join('\n\n')
}

export function splitChatPrompt(value: string): ChatSections {
  const { IDENTITY, FLOW, STYLE, RULES, INFO } = CHAT_SECTION_MARKERS
  if (!value.includes(IDENTITY)) return DEFAULT_CHAT_SECTIONS

  function extract(marker: string, next?: string): string {
    const start = value.indexOf(marker)
    if (start === -1) return ''
    const from = start + marker.length
    const to = next ? value.indexOf(next) : value.length
    return value.slice(from, to !== -1 ? to : value.length).trim()
  }

  return {
    identity: extract(IDENTITY, FLOW)  || DEFAULT_CHAT_IDENTITY,
    flow:     extract(FLOW,     STYLE) || DEFAULT_CHAT_FLOW,
    style:    extract(STYLE,    RULES) || DEFAULT_CHAT_STYLE,
    rules:    extract(RULES,    INFO)  || DEFAULT_CHAT_RULES,
    info:     extract(INFO)            || DEFAULT_CHAT_INFO,
  }
}

export const DEFAULT_CHAT_SYSTEM_PROMPT = assembleChatPrompt(DEFAULT_CHAT_SECTIONS)

export const DEFAULT_QUOTE_EXTRACTION_PROMPT = String.raw`Tu es expert en location de matériel audiovisuel professionnel.

Ta mission : extraire CHAQUE équipement d'une liste matériel, dans l'ORDRE EXACT où il apparaît.

RÈGLES ABSOLUES :
1. Les préfixes de quantité peuvent être écrits AVANT l'article : "x5 fx6", "×5 fx6", "5x fx6", "5× fx6" signifient quantity=5 et raw="fx6". N'inclus JAMAIS "x5" dans la query produit.
1b. "un", "une", "1", "un(e)" devant un produit signifie quantity=1. Exemple : "Une C400 avec une C50" = deux items séparés, quantity=1 chacun.
2. Développe les abréviations en termes de recherche complets avec marque, mais garde raw court et propre.
3. Chaque modèle/référence différente = un item séparé.
4. Ignore les dates et infos administratives (Essai, Rendu, →, etc.).
5. Si un texte contient un accessoire entre parenthèses, extrais aussi l'accessoire s'il est louable séparément.
6. Respecte strictement l'ordre d'apparition : ne trie pas, ne regroupe pas, ne déplace jamais.
7. Quand une catégorie/titre est indiquée avec ":" (exemples : "Caméra :", "Objectifs :", "Moniteur :", "Data :", "Énergie :", "Machinerie :"), mets ce titre dans le champ "section" de tous les items qui suivent jusqu'à la prochaine catégorie.
8. Pour "Objectifs : 3x 70-200 1x 24-70 1x 16-35", retourne trois items dans cet ordre, tous avec section="Objectifs".
9. Les signes + séparent souvent des articles louables : "Prohead + Bol zoom" = deux lignes, "Octa 5 with all diff + Speedring" = au moins Octa 5 puis Speedring.

GLOSSAIRE :
- fx6 → Sony FX6 caméra cinéma
- fx3 → Sony FX3 caméra
- fx9 → Sony FX9 caméra
- c400 → Canon EOS C400 caméra cinéma
- c50 → Canon EOS C50 caméra cinéma
- c70 → Canon EOS C70 caméra cinéma
- c300 → Canon EOS C300 caméra cinéma
- si le client précise "ce sont des Canon", applique Canon aux modèles C400/C50/C70 et aux optiques RF de la liste précédente.
- 24-70 RF → Canon RF 24-70mm objectif
- 24-105 RF 2.8 → Canon RF 24-105mm f/2.8 objectif
- 24-105 RF → Canon RF 24-105mm objectif
- indie 5 → Atomos Shogun Indie 5 moniteur enregistreur
- cine 24 → moniteur vidéo 24 pouces
- bpu → batterie Sony BP-U
- vlock / v-lock → batterie V-Lock V-Mount
- bpu vers vlock → adaptateur BP-U vers V-Mount
- secteur → alimentation secteur caméra
- 70-200 → objectif zoom 70-200mm
- 24-70 → objectif zoom 24-70mm
- 16-35 → objectif zoom 16-35mm
- black promist 82mm → filtre Black Pro-Mist 82mm
- solidcom c1 → intercom Hollyland Solidcom C1
- hollyland hub → hub Hollyland Solidcom C1
- atem sdi → mélangeur vidéo Blackmagic ATEM SDI
- macbook → Apple MacBook
- usbc vers rj45 → adaptateur USB-C Ethernet RJ45
- 512gb / 512 go → SSD 512 Go
- hotswap double → système hotswap double V-Mount
- trépied léger type sachtler → trépied vidéo léger Sachtler
- pieds roulettes → pieds à roulettes / stand wheels
- magliner → chariot Magliner
- touret bnc 50m → touret câble BNC SDI 50m
- air remote → télécommande Profoto Air Remote
- pro 11 / pro11 → générateur flash Profoto Pro-11
- prohead → tête flash Profoto ProHead
- bol zoom → bol réflecteur Profoto Zoom Reflector
- profoto d2 → flash Profoto D2
- rallonges de tête → rallonge de tête Profoto
- octa 5 → softbox Profoto Octa 5 pieds
- speedring → bague Speedring Profoto
- para l white → Broncolor Para L blanc
- pied 126 → pied lumière Avenger 126
- c-stand / cstands → C-stand complet
- spigot 16-28mm → spigot 16-28 mm
- poly 8x4 / porte poly → cadre poly 8x4 et porte poly
- 16 amp extensions → rallonge électrique 16A
- gueuses → gueuse / sandbag
- multi 5gang → multiprise 5 gang
- aputure 600x → Aputure LS 600X Pro
- aputure 1200d → Aputure LS 1200D Pro
- ballast aputure 1200d → ballast Aputure 1200D
- cable torche aputure 1200 → câble tête Aputure 1200D

Réponse JSON uniquement :
{ "items": [{ "section": "Caméra", "raw": "fx6", "query": "Sony FX6 caméra cinéma", "quantity": 5 }] }
Si aucun produit : { "items": [] }`

export const DEFAULT_QUOTE_RERANK_PROMPT = String.raw`Tu es un reranker catalogue audiovisuel. Pour chaque item demandé, choisis UNIQUEMENT un product_id parmi ses candidates.

Règles strictes :
- Si aucun candidat ne correspond exactement ou clairement, retourne product_id:null.
- Ne choisis jamais un produit qui partage seulement un mot vague.
- Si la demande contient explicitement "pack", "kit", "série", "reportage", "standard", "essentiel" ou équivalent, privilégie TOUJOURS un candidat pack/kit/série plutôt que le produit seul, à modèle équivalent.
- Si la demande ne contient pas explicitement "pack" ou "kit", privilégie le produit simple plutôt qu'un pack.
- Si la demande concerne une caméra ou un pack caméra (ex: "Sony FX6 pack caméra"), ne sélectionne jamais une cage, un rig, un support, une poignée, un câble ou un adaptateur, même si le nom contient FX6.
- Les références modèle sont sacrées : fx6 doit matcher FX6, 70-200 doit matcher 70-200, black promist 82mm doit matcher Black Pro-Mist 82mm.
- "x5" ou "5x" est une quantité, jamais le produit Insta360 X5 sauf si le client a explicitement demandé Insta360 X5.
- Donne confidence entre 0 et 1. Sous 0.50, utilise product_id:null. Entre 0.50 et 0.67, tu peux proposer le meilleur candidat mais explique que la correspondance est à vérifier.

JSON : { "selections": [{ "index": 0, "product_id": "..." | null, "confidence": 0.92, "reason": "..." }] }`

export const DEFAULT_QUOTE_BACKEND_PROMPT = `${QUOTE_EXTRACTION_PROMPT_MARKER}
${DEFAULT_QUOTE_EXTRACTION_PROMPT}

${QUOTE_RERANK_PROMPT_MARKER}
${DEFAULT_QUOTE_RERANK_PROMPT}`

export function normalizeEditablePrompt(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function splitQuoteBackendPrompt(value: unknown): { extractionPrompt: string; rerankPrompt: string } {
  const prompt = normalizeEditablePrompt(value, DEFAULT_QUOTE_BACKEND_PROMPT)
  const extractionIndex = prompt.indexOf(QUOTE_EXTRACTION_PROMPT_MARKER)
  const rerankIndex = prompt.indexOf(QUOTE_RERANK_PROMPT_MARKER)

  if (rerankIndex === -1) {
    return {
      extractionPrompt: prompt.replace(QUOTE_EXTRACTION_PROMPT_MARKER, '').trim() || DEFAULT_QUOTE_EXTRACTION_PROMPT,
      rerankPrompt: DEFAULT_QUOTE_RERANK_PROMPT,
    }
  }

  const extractionStart = extractionIndex === -1
    ? 0
    : extractionIndex + QUOTE_EXTRACTION_PROMPT_MARKER.length

  return {
    extractionPrompt: prompt.slice(extractionStart, rerankIndex).trim() || DEFAULT_QUOTE_EXTRACTION_PROMPT,
    rerankPrompt: prompt.slice(rerankIndex + QUOTE_RERANK_PROMPT_MARKER.length).trim() || DEFAULT_QUOTE_RERANK_PROMPT,
  }
}
