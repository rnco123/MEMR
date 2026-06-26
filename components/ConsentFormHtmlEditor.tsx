'use client'

import { useId, useMemo, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useT } from '@/lib/i18n'
import { CONSENT_FORM_PLACEHOLDERS } from '@/lib/forms/consent-placeholders'

type Props = {
  value: string
  onChange: (html: string) => void
  minHeightClass?: string
}

function ToolbarButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-sm font-medium transition-colors disabled:opacity-40 ${
        active
          ? 'bg-violet-100 text-violet-800'
          : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}

export function ConsentFormHtmlEditor({
  value,
  onChange,
  minHeightClass = 'min-h-[280px]',
}: Props) {
  const { t } = useT()
  const fieldSelectId = useId()
  const [mode, setMode] = useState<'visual' | 'html'>('visual')
  const extensions = useMemo(() => [StarterKit], [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      if (ed.isDestroyed) return
      onChange(ed.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none px-3 py-3 text-slate-900 focus:outline-none ${minHeightClass}`,
      },
    },
  })

  const insertPlaceholder = (token: string) => {
    if (mode === 'html') {
      onChange(`${value}${token}`)
      return
    }
    editor?.chain().focus().insertContent(token).run()
  }

  return (
    <div className="mt-1 rounded-lg border border-slate-300 bg-white overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          <ToolbarButton
            active={mode === 'visual'}
            onClick={() => setMode('visual')}
            title={t('admin.forms.editor_visual')}
          >
            {t('admin.forms.editor_visual')}
          </ToolbarButton>
          <ToolbarButton
            active={mode === 'html'}
            onClick={() => setMode('html')}
            title={t('admin.forms.editor_html')}
          >
            {t('admin.forms.editor_html')}
          </ToolbarButton>
        </div>

        <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:inline" aria-hidden />

        {mode === 'visual' && editor && (
          <div className="flex flex-wrap items-center gap-0.5">
            <ToolbarButton
              active={editor.isActive('bold')}
              onClick={() => editor.chain().focus().toggleBold().run()}
              title={t('admin.forms.editor_bold')}
            >
              <strong>B</strong>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('italic')}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              title={t('admin.forms.editor_italic')}
            >
              <em>I</em>
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              title={t('admin.forms.editor_bullets')}
            >
              •
            </ToolbarButton>
            <ToolbarButton
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              title={t('admin.forms.editor_numbers')}
            >
              1.
            </ToolbarButton>
          </div>
        )}

        <label htmlFor={fieldSelectId} className="sr-only">
          {t('admin.forms.editor_insert_field')}
        </label>
        <select
          id={fieldSelectId}
          defaultValue=""
          onChange={(e) => {
            const token = e.target.value
            if (!token) return
            insertPlaceholder(token)
            e.target.value = ''
          }}
          className="ml-auto max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
        >
          <option value="">{t('admin.forms.editor_insert_field')}</option>
          {CONSENT_FORM_PLACEHOLDERS.map((field) => (
            <option key={field.token} value={field.token}>
              {t(field.labelKey)} ({field.token})
            </option>
          ))}
        </select>
      </div>

      {mode === 'visual' ? (
        <EditorContent editor={editor} className="consent-form-tiptap bg-white" />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={14}
          className={`w-full resize-y border-0 px-3 py-2 font-mono text-xs text-slate-800 focus:outline-none focus:ring-0 ${minHeightClass}`}
          spellCheck={false}
        />
      )}

      <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
        {t('admin.forms.editor_hint')}
      </p>
    </div>
  )
}
