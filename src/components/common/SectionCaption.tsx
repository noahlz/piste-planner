import { cn } from '@/lib/utils'
import { CAPTION_CLASS } from './caption.ts'

/** Section caption above each panel field group (standing rule 13). */
export function SectionCaption({ children }: { children: string }) {
  return <div className={cn('mb-[7px]', CAPTION_CLASS)}>{children}</div>
}
