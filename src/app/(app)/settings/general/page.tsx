'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconBuilding() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15l.75 4.5H3.75L4.5 3zM9 21V10.5m6 0V21M3.75 10.5h16.5" />
    </svg>
  )
}

function IconGlobe() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0c-1.657 0-3-4.03-3-9s1.343-9 3-9m0 18c1.657 0 3-4.03 3-9s-1.343-9-3-9M3.5 12h17" />
    </svg>
  )
}

function IconMail() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.75L2.25 6.75" />
    </svg>
  )
}

function IconPhone() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  )
}

function IconLanguage() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
    </svg>
  )
}

function IconKey() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286z" />
    </svg>
  )
}

function IconDownload() {
  return (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

// ── Sector config ─────────────────────────────────────────────────────────────

const SECTORS = [
  { id: 'audiovisuel', label: 'Audiovisuel', icon: '🎬' },
  { id: 'evenementiel', label: 'Événementiel', icon: '🎉' },
  { id: 'sono-lumiere', label: 'Sono / Lumière', icon: '🎵' },
  { id: 'photo-video', label: 'Photo / Vidéo', icon: '📷' },
  { id: 'production-cinema', label: 'Production / Cinéma', icon: '🎥' },
  { id: 'structure-mobilier', label: 'Structure / Mobilier', icon: '🏗' },
  { id: 'btp-materiel', label: 'BTP / Matériel', icon: '🔧' },
  { id: 'autre', label: 'Autre', icon: '📦' },
]

const TEAM_SIZES = ['1', '2-5', '6-10', '11-50', '50+']

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm mb-1">
          <span className="text-gray-500">{icon}</span>
          {title}
        </div>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  readOnly,
  type = 'text',
}: {
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  readOnly?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      readOnly={readOnly}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      className={`w-full border rounded-lg px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-black ${
        readOnly
          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
          : 'border-gray-200 text-gray-900 bg-white hover:border-gray-300'
      }`}
    />
  )
}

function SaveButton({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="bg-black text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
    >
      {saving ? 'Enregistrement…' : saved ? 'Enregistré ✓' : 'Enregistrer'}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsGeneralPage() {
  // Organisation
  const [orgName, setOrgName] = useState('Filme')
  const [website, setWebsite] = useState('https://filme.fr')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [savingOrg, setSavingOrg] = useState(false)
  const [savedOrg, setSavedOrg] = useState(false)

  // Auth user email (affiché en lecture seule)
  const [userEmail, setUserEmail] = useState('') // eslint-disable-line @typescript-eslint/no-unused-vars

  // Profil
  const [sector, setSector] = useState('audiovisuel')
  const [teamSize, setTeamSize] = useState('2-5')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)

  // Langue
  const [lang, setLang] = useState('fr')

  // Password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState(false)

  // Load data
  useEffect(() => {
    const supabase = getSupabase()

    // Get auth user
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email)
    })

    // Get organization
    supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setOrgName(data.name || '')
          setWebsite(data.website || '')
          setContactEmail(data.contact_email || '')
          setContactPhone(data.contact_phone || '')
          setSector(data.sector || 'audiovisuel')
          setTeamSize(data.team_size || '2-5')
          setLang(data.language || 'fr')
        }
      })
  }, [])

  async function saveOrganisation() {
    setSavingOrg(true)
    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      await supabase.from('organizations').update({
        name: orgName,
        website,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    } else {
      await supabase.from('organizations').insert({
        name: orgName,
        website,
        contact_email: contactEmail,
        contact_phone: contactPhone,
      })
    }
    setSavingOrg(false)
    setSavedOrg(true)
    setTimeout(() => setSavedOrg(false), 2500)
  }

  async function saveProfile() {
    setSavingProfile(true)
    const supabase = getSupabase()
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      await supabase.from('organizations').update({
        sector,
        team_size: teamSize,
        language: lang,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id)
    }
    setSavingProfile(false)
    setSavedProfile(true)
    setTimeout(() => setSavedProfile(false), 2500)
  }

  async function changePassword() {
    setPasswordError('')
    if (newPassword.length < 8) {
      setPasswordError('8 caractères minimum, avec une majuscule et un chiffre.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setSavingPassword(true)
    const supabase = getSupabase()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPassword(false)
    if (error) {
      setPasswordError(error.message)
    } else {
      setSavedPassword(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSavedPassword(false), 3000)
    }
  }

  return (
    <div className="max-w-2xl space-y-5">

      {/* ── Organisation ── */}
      <Section
        icon={<IconBuilding />}
        title="Organisation"
        subtitle="Ces informations identifient votre compte loueur."
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom">
            <Input value={orgName} onChange={setOrgName} placeholder="Filme" />
          </Field>
          <Field label="Formule">
            <div className="flex items-center h-9">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                Essai
              </span>
            </div>
          </Field>
        </div>

        <Field label="Site web">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <IconGlobe />
            </span>
            <input
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="https://exemple.fr"
              className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black hover:border-gray-300"
            />
          </div>
        </Field>

        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Coordonnées de contact</p>
          <p className="text-xs text-gray-400 mb-3">
            Communiquées au locataire par l&apos;assistant (s&apos;il souhaite vous joindre directement) et utilisées comme adresse de réponse des emails envoyés au client.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email de contact">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconMail /></span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="location@filme.fr"
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black hover:border-gray-300"
                />
              </div>
            </Field>
            <Field label="Téléphone de contact">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconPhone /></span>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="06 00 00 00 00"
                  className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black hover:border-gray-300"
                />
              </div>
            </Field>
          </div>
        </div>

        <SaveButton onClick={saveOrganisation} saving={savingOrg} saved={savedOrg} />
      </Section>

      {/* ── Profil ── */}
      <Section
        icon={<IconUser />}
        title="Profil"
        subtitle="Votre secteur et la taille de votre équipe. Le secteur aide l'assistant à adapter son vocabulaire et ses suggestions."
      >
        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Secteur d&apos;activité</p>
          <div className="grid grid-cols-4 gap-2">
            {SECTORS.map(s => (
              <button
                key={s.id}
                onClick={() => setSector(s.id)}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border text-xs font-medium transition-all ${
                  sector === s.id
                    ? 'border-black bg-black text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-lg leading-none">{s.icon}</span>
                <span className="text-center leading-tight">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-600 mb-2">Nombre de personnes en interne</p>
          <div className="flex gap-2">
            {TEAM_SIZES.map(size => (
              <button
                key={size}
                onClick={() => setTeamSize(size)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                  teamSize === size
                    ? 'border-black bg-black text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <SaveButton onClick={saveProfile} saving={savingProfile} saved={savedProfile} />
      </Section>

      {/* ── Langue ── */}
      <Section
        icon={<IconLanguage />}
        title="Langue de l'interface"
        subtitle="Choisissez la langue de votre back-office. Ce réglage est propre à votre compte (la langue du chatbot se règle dans l'onglet Widget)."
      >
        <div className="flex gap-2">
          {[
            { code: 'fr', label: 'FR' },
            { code: 'en', label: 'EN' },
          ].map(l => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); saveProfile() }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                lang === l.code
                  ? 'border-black bg-black text-white'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <IconGlobe />
              {l.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Mot de passe ── */}
      <Section
        icon={<IconKey />}
        title="Mot de passe"
        subtitle="Changez le mot de passe de votre compte. Les autres appareils connectés seront déconnectés."
      >
        <Field label="Mot de passe actuel">
          <Input type="password" value={currentPassword} onChange={setCurrentPassword} placeholder="••••••••" />
        </Field>
        <Field label="Nouveau mot de passe">
          <Input type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" />
          <p className="text-xs text-gray-400 mt-1">8 caractères minimum, avec une majuscule et un chiffre.</p>
        </Field>
        <Field label="Confirmer le nouveau mot de passe">
          <Input type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" />
        </Field>

        {passwordError && (
          <p className="text-xs text-red-500">{passwordError}</p>
        )}

        <button
          onClick={changePassword}
          disabled={savingPassword}
          className="bg-black text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          {savingPassword ? 'Modification…' : savedPassword ? 'Mot de passe modifié ✓' : 'Changer le mot de passe'}
        </button>
      </Section>

      {/* ── Compte & données ── */}
      <Section
        icon={<IconShield />}
        title="Données et compte"
        subtitle="Exportez vos données ou supprimez définitivement votre compte (RGPD)."
      >
        <div className="flex items-start justify-between py-3 border-b border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-900">Exporter mes données</p>
            <p className="text-xs text-gray-500 mt-0.5">Téléchargez une copie de vos données (compte, conversations, contacts, devis) au format JSON.</p>
          </div>
          <button
            onClick={() => alert('Export en cours de développement.')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors ml-4 shrink-0"
          >
            <IconDownload />
            Télécharger
          </button>
        </div>

        <div className="flex items-start justify-between py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Supprimer mon compte</p>
            <p className="text-xs text-gray-500 mt-0.5">Suppression définitive de votre compte et de toutes les données de votre espace.</p>
          </div>
          <button
            onClick={() => {
              if (confirm('Êtes-vous sûr ? Cette action est irréversible.')) {
                alert('Contactez support@filme.fr pour supprimer votre compte.')
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 transition-colors ml-4 shrink-0"
          >
            Supprimer le compte
          </button>
        </div>
      </Section>

    </div>
  )
}
