'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Upload, Save, Trash2 } from 'lucide-react'
import { useState, useRef } from 'react'

export function BrandKit() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    brandName: '',
    primaryColor: '#FF6B35',
    secondaryColor: '#FFFFFF',
    accentColor: '#000000',
    fontFamily: 'Arial',
    watermarkPosition: 'bottom-right',
    watermarkOpacity: 0.7,
    watermarkScale: 0.15,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['brandkit'],
    queryFn: async () => (await fetch('/api/brandkit')).json(),
  })

  // Sync form when data loads
  if (data?.brandKit && form.brandName === '' && data.brandKit.brandName) {
    setForm({
      brandName: data.brandKit.brandName || '',
      primaryColor: data.brandKit.primaryColor || '#FF6B35',
      secondaryColor: data.brandKit.secondaryColor || '#FFFFFF',
      accentColor: data.brandKit.accentColor || '#000000',
      fontFamily: data.brandKit.fontFamily || 'Arial',
      watermarkPosition: data.brandKit.watermarkPosition || 'bottom-right',
      watermarkOpacity: data.brandKit.watermarkOpacity ?? 0.7,
      watermarkScale: data.brandKit.watermarkScale ?? 0.15,
    })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/brandkit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Save failed')
      toast.success('Brand kit saved')
      queryClient.invalidateQueries({ queryKey: ['brandkit'] })
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function uploadLogo(file: File) {
    const fd = new FormData()
    fd.append('logo', file)
    Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)))
    try {
      const res = await fetch('/api/brandkit', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      toast.success('Logo uploaded')
      queryClient.invalidateQueries({ queryKey: ['brandkit'] })
    } catch (err: any) {
      toast.error(err.message)
    }
  }

  async function deleteBrandKit() {
    if (!confirm('Delete entire brand kit?')) return
    await fetch('/api/brandkit', { method: 'DELETE' })
    toast.success('Brand kit deleted')
    queryClient.invalidateQueries({ queryKey: ['brandkit'] })
    setForm({
      brandName: '',
      primaryColor: '#FF6B35',
      secondaryColor: '#FFFFFF',
      accentColor: '#000000',
      fontFamily: 'Arial',
      watermarkPosition: 'bottom-right',
      watermarkOpacity: 0.7,
      watermarkScale: 0.15,
    })
  }

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="size-6 animate-spin text-neutral-400" /></div>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold">Brand Kit</h2>
        <p className="text-sm text-neutral-500 mt-1">Store your logo, colors, and fonts once. Auto-applied to every video as a watermark.</p>
      </div>

      {/* Logo upload */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h3 className="font-semibold text-sm mb-3">Logo</h3>
        <div className="flex items-center gap-4">
          {data?.brandKit?.logoUrl ? (
            <img src={data.brandKit.logoUrl} alt="Logo" className="size-20 rounded-lg border border-neutral-200 dark:border-neutral-800 object-contain bg-white" />
          ) : (
            <div className="size-20 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-neutral-400">
              <Upload className="size-6" />
            </div>
          )}
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])}
            />
            <button
              onClick={() => fileInput.current?.click()}
              className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              {data?.brandKit?.logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            <p className="text-xs text-neutral-500 mt-1">PNG with transparency recommended</p>
          </div>
        </div>
      </div>

      {/* Colors + fonts */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <h3 className="font-semibold text-sm">Brand Identity</h3>

        <div>
          <label className="text-sm font-medium">Brand Name</label>
          <input value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} placeholder="e.g. Puppy Adventures" className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium">Primary Color</label>
            <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-full mt-1 h-10 rounded-md border border-neutral-200 dark:border-neutral-800" />
          </div>
          <div>
            <label className="text-xs font-medium">Secondary</label>
            <input type="color" value={form.secondaryColor} onChange={e => setForm(f => ({ ...f, secondaryColor: e.target.value }))} className="w-full mt-1 h-10 rounded-md border border-neutral-200 dark:border-neutral-800" />
          </div>
          <div>
            <label className="text-xs font-medium">Accent</label>
            <input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="w-full mt-1 h-10 rounded-md border border-neutral-200 dark:border-neutral-800" />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Font Family</label>
          <select value={form.fontFamily} onChange={e => setForm(f => ({ ...f, fontFamily: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
            <option>Arial</option>
            <option>Helvetica</option>
            <option>Georgia</option>
            <option>Times New Roman</option>
            <option>Inter</option>
            <option>Roboto</option>
            <option>Montserrat</option>
            <option>Poppins</option>
            <option>Impact</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Watermark Position</label>
            <select value={form.watermarkPosition} onChange={e => setForm(f => ({ ...f, watermarkPosition: e.target.value }))} className="w-full mt-1 px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent text-sm">
              <option value="top-left">Top Left</option>
              <option value="top-right">Top Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="bottom-right">Bottom Right</option>
              <option value="center">Center</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Watermark Size ({Math.round(form.watermarkScale * 100)}%)</label>
            <input type="range" min={0.05} max={0.4} step={0.01} value={form.watermarkScale} onChange={e => setForm(f => ({ ...f, watermarkScale: parseFloat(e.target.value) }))} className="w-full mt-3" />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-sm font-medium disabled:opacity-50">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save Brand Kit
        </button>
        <button onClick={deleteBrandKit} className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50">
          <Trash2 className="size-4" /> Delete
        </button>
      </div>
    </div>
  )
}
