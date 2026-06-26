'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle, ExternalLink, Save, Trash2, Loader2, KeyRound } from 'lucide-react'

interface SecretField {
  id: string
  label: string
  platform: string
  required: boolean
  placeholder?: string
  helpUrl?: string
  hasValue: boolean
  preview: string
  updatedAt: string | null
}

interface SecretGroup {
  id: string
  label: string
  description: string
  helpUrl?: string
  configured: boolean
  fields: SecretField[]
}

export function ApiKeys() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['secrets'],
    queryFn: async () => (await fetch('/api/secrets')).json(),
  })
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const groups: SecretGroup[] = data?.groups || []

  async function save(platform: string) {
    const platformFields = groups.find(g => g.id === platform)?.fields || []
    const toSave = platformFields
      .filter(f => values[f.id])
      .map(f => ({
        id: f.id,
        value: values[f.id],
        label: f.label,
        platform: f.platform,
      }))
    if (toSave.length === 0) {
      toast.info('No changes to save')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets: toSave }),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success(`Saved ${toSave.length} key(s) for ${platform}`)
      // Clear the input values
      setValues(prev => {
        const next = { ...prev }
        for (const f of toSave) delete next[f.id]
        return next
      })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function clearSecret(id: string, label: string) {
    if (!confirm(`Remove ${label}? You'll need to re-enter it to use this platform.`)) return
    try {
      await fetch(`/api/secrets/${encodeURIComponent(id)}`, { method: 'DELETE' })
      toast.success(`Removed ${label}`)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-neutral-400" />
      </div>
    )
  }

  const totalConfigured = groups.filter(g => g.configured).length

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-orange-500" />
          <h2 className="text-xl font-bold">API Keys</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Add your social media API credentials here. Keys are encrypted before being stored in the database.
          {totalConfigured > 0 && (
            <span className="ml-1 text-emerald-600 font-medium">{totalConfigured}/{groups.length} platforms configured ✓</span>
          )}
        </p>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
        <h3 className="font-semibold text-blue-800 dark:text-blue-200 text-sm flex items-center gap-2">
          <AlertCircle className="size-4" /> One-time setup required
        </h3>
        <p className="text-sm text-blue-800 dark:text-blue-100 mt-1">
          You need to create a developer app on each platform's site to get these credentials. Click the platform names below for direct links to their developer portals.
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
          <strong>OAuth Redirect URL</strong> for all platforms: <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50 break-all">{typeof window !== 'undefined' ? window.location.origin : 'https://yourdomain.com'}/api/social/callback/[platform]</code>
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
          📖 For full deployment instructions (including Vercel hosting + database setup), see <code className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/50">DEPLOYMENT.md</code> in the project root.
        </p>
      </div>

      {groups.map(group => (
        <div key={group.id} className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-neutral-800">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{group.label}</h3>
                {group.configured ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <CheckCircle2 className="size-3" /> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    Not configured
                  </span>
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">{group.description}</p>
            </div>
            {group.helpUrl && (
              <a href={group.helpUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                Get keys <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <div className="p-4 space-y-3">
            {group.fields.map(field => (
              <div key={field.id}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  {field.hasValue && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-500">{field.preview}</span>
                      <button
                        onClick={() => clearSecret(field.id, field.label)}
                        className="text-red-600 hover:text-red-700"
                        title="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="password"
                  placeholder={field.hasValue ? '•••••••• (saved — type to replace)' : (field.placeholder || `Enter ${field.label}`)}
                  value={values[field.id] || ''}
                  onChange={e => setValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm font-mono"
                  autoComplete="off"
                />
                {field.helpUrl && !field.hasValue && (
                  <a href={field.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline mt-1 inline-flex items-center gap-1">
                    How to get this <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => save(group.id)}
                disabled={saving || !group.fields.some(f => values[f.id])}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save {group.label} keys
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
