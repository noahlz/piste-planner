import { useState, useRef } from 'react'
import { useStore } from '../../store/store.ts'
import {
  serializeState,
  deserializeState,
  encodeToUrl,
} from '../../store/serialization.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Upload, Share2, Copy, Check } from 'lucide-react'

const URL_SIZE_WARNING_BYTES = 2048

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
    <Card>
      <CardHeader>
        <CardTitle>Save / Load / Share</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Save */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Save Configuration</h3>
          <Button type="button" onClick={handleSave}>
            <Download className="mr-2 h-4 w-4" />
            Save to File
          </Button>
        </div>

        {/* Load */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Load Configuration</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.piste.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Load from File
          </Button>
          {loadError && (
            <p className="mt-2 text-sm text-error-text" role="alert">
              {loadError}
            </p>
          )}
        </div>

        {/* Share */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Share via URL</h3>
          <Button type="button" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            Generate Link
          </Button>

          {shareUrl && (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-muted text-xs"
                />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
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
      </CardContent>
    </Card>
  )
}
