import { useState, useRef } from 'react'
import {
  saveToFile,
  parseTournamentFile,
  applyLoadedState,
  buildShareLink,
  shareLinkExceedsLimit,
  copyToClipboard,
} from '../../store/exportActions.ts'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, Upload, Share2, Copy, Check } from 'lucide-react'

interface ExportPopoverProps {
  /** Test-only: opens the popover without a pointer-capture-dependent click. */
  defaultOpen?: boolean
}

/** `FileReader`'s `onerror` rejects with a `DOMException`, which does not
 * reliably satisfy `instanceof Error` — read `.message` structurally instead. */
function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return String(err)
}

/**
 * The Header's Export control (013 T010, ui-contract.md §Header, FR-004–FR-009):
 * the retired top bar's save/load/share behavior, unchanged, behind one Popover
 * trigger instead of the old `Collapsible` under "Save / Share".
 */
export function ExportPopover({ defaultOpen }: ExportPopoverProps) {
  const [loadError, setLoadError] = useState<string | null>(null)
  const [droppedPlacements, setDroppedPlacements] = useState<string[]>([])
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    saveToFile()
  }

  async function handleLoad(file: File) {
    try {
      const result = await parseTournamentFile(file)
      if ('error' in result) {
        setLoadError(result.error)
      } else {
        applyLoadedState(result.state)
        setLoadError(null)
        // A lenient load keeps going but says what it threw away, so a
        // silently shorter schedule never looks like the saved one.
        setDroppedPlacements(result.droppedPlacements)
      }
    } catch (err) {
      // parseTournamentFile's readFileText rejects when FileReader fires
      // onerror (an unreadable file, not a parse failure) — with no catch
      // here that rejection reaches no error boundary (React review of
      // T007). Route it into the same alert a parse/schema error uses.
      setLoadError(`Could not read the file: ${errorMessage(err)}`)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      void handleLoad(file)
    }
    // Reset so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleShare() {
    setShareUrl(buildShareLink())
    setCopied(false)
  }

  async function handleCopy() {
    if (!shareUrl) return
    setCopied(await copyToClipboard(shareUrl))
  }

  const urlExceedsLimit = shareUrl != null && shareLinkExceedsLimit(shareUrl)

  return (
    <Popover defaultOpen={defaultOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Export"
          title="Export"
          className="border-[1.5px] border-chrome-border bg-secondary text-neutral-700 hover:border-accent-400 hover:bg-hover-tint hover:text-accent-700"
        >
          <Download className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] space-y-4">
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
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Load from File
          </Button>
          {loadError && (
            <p className="mt-2 text-sm text-error-text" role="alert">
              {loadError}
            </p>
          )}
          {/* Always mounted: a live region only announces changes if it exists
              in the DOM before the content lands. */}
          <p
            className={droppedPlacements.length > 0 ? 'mt-2 text-sm text-warning-text' : undefined}
            role="status"
          >
            {droppedPlacements.length > 0 && (
              <>
                Dropped {droppedPlacements.length} placement
                {droppedPlacements.length === 1 ? '' : 's'} for events not in this
                configuration: {droppedPlacements.join(', ')}
              </>
            )}
          </p>
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
                <Input readOnly value={shareUrl} className="flex-1 bg-muted text-xs" />
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
      </PopoverContent>
    </Popover>
  )
}
