import { useState, useRef } from 'react'
import { useStore } from '../../store/store.ts'
import {
  serializeState,
  deserializeState,
  encodeToUrl,
} from '../../store/serialization.ts'

const URL_SIZE_WARNING_BYTES = 2048

const BTN_PRIMARY = 'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none'
const BTN_SECONDARY = 'rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-body transition-colors hover:bg-slate-200 focus:ring-2 focus:ring-accent focus:outline-none'

export function SaveLoadShare() {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    const state = useStore.getState()
    const json = serializeState(state)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tournament.piste.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleLoad(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const result = deserializeState(reader.result as string)
      if ('error' in result) {
        setLoadError(result.error)
      } else {
        useStore.setState(result.state)
        setLoadError(null)
      }
    }
    reader.readAsText(file)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      handleLoad(file)
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleShare() {
    const state = useStore.getState()
    const hash = encodeToUrl(state)
    const url = `${window.location.origin}${window.location.pathname}${hash}`
    setShareUrl(url)
    setCopied(false)
  }

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
    } catch {
      // Fallback: select the text for manual copy
    }
  }

  const urlExceedsLimit = shareUrl != null && new Blob([shareUrl]).size > URL_SIZE_WARNING_BYTES

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Save / Load / Share</h2>

      <div className="space-y-4">
        {/* Save */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-body">Save Configuration</h3>
          <button
            type="button"
            onClick={handleSave}
            className={BTN_PRIMARY}
          >
            Save to File
          </button>
        </div>

        {/* Load */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-body">Load Configuration</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.piste.json"
            onChange={handleFileChange}
            className="block text-sm text-body file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-body file:cursor-pointer hover:file:bg-slate-200"
          />
          {loadError && (
            <p className="mt-2 text-sm text-error-text" role="alert">
              {loadError}
            </p>
          )}
        </div>

        {/* Share */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-body">Share via URL</h3>
          <button
            type="button"
            onClick={handleShare}
            className={BTN_PRIMARY}
          >
            Generate Link
          </button>

          {shareUrl && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-body"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={BTN_SECONDARY}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              {urlExceedsLimit && (
                <p className="text-xs text-warning-text" role="status">
                  Warning: URL exceeds 2KB and may not work in all browsers. Consider saving to file
                  instead.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
