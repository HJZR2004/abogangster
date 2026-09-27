import { useState } from 'react'
import { FolderOpen, Save, X } from 'lucide-react'
import type { CaseInput, CaseRecord } from '@shared/types'
import { errorText, invoke } from '../lib/api'
import { useFeedback, Modal } from './feedback'
import { Button, Checkbox, Field, Input, Select, Textarea } from './ui'

const EMPTY: CaseInput = {
  title: '',
  clientName: '',
  caseNumber: '',
  court: '',
  counterparty: '',
  description: '',
  status: 'activo',
  localOnly: false
}

interface Props {
  open: boolean
  onClose: () => void
  /** Existing case to edit; omit to create a new one. */
  existing?: CaseRecord
  onSaved: (record: CaseRecord) => void
}

export function CaseForm({ open, onClose, existing, onSaved }: Props) {
  const feedback = useFeedback()
  const [form, setForm] = useState<CaseInput>(existing ?? EMPTY)
  const [importFolder, setImportFolder] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof CaseInput>(key: K, value: CaseInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    if (!form.title.trim()) {
      feedback.error('Escriba un nombre para el caso.')
      return
    }
    setSaving(true)
    try {
      const record = existing ? await invoke('cases:update', existing.id, form) : await invoke('cases:create', form)
      if (!existing && importFolder) {
        await invoke('documents:import', record.id, [importFolder])
        feedback.success('Caso creado. Los documentos se están leyendo en segundo plano.')
      } else {
        feedback.success(existing ? 'Cambios guardados.' : 'Caso creado.')
      }
      onSaved(record)
      if (!existing) {
        setForm(EMPTY)
        setImportFolder(null)
      }
    } catch (err) {
      feedback.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={existing ? 'Editar datos del caso' : 'Nuevo caso'}
      footer={
        <>
          <Button onClick={onClose} icon={X}>
            Cancelar
          </Button>
          <Button variant="primary" icon={Save} onClick={() => void save()} loading={saving}>
            {existing ? 'Guardar cambios' : 'Crear caso'}
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Nombre del caso *" hint="Por ejemplo: «García contra Constructora del Norte».">
            {(id) => <Input id={id} value={form.title} onChange={(e) => set('title', e.target.value)} autoFocus />}
          </Field>
        </div>
        <Field label="Cliente">{(id) => <Input id={id} value={form.clientName} onChange={(e) => set('clientName', e.target.value)} />}</Field>
        <Field label="Número de expediente">{(id) => <Input id={id} value={form.caseNumber} onChange={(e) => set('caseNumber', e.target.value)} />}</Field>
        <Field label="Juzgado o autoridad">{(id) => <Input id={id} value={form.court} onChange={(e) => set('court', e.target.value)} />}</Field>
        <Field label="Contraparte">{(id) => <Input id={id} value={form.counterparty} onChange={(e) => set('counterparty', e.target.value)} />}</Field>
        <div className="md:col-span-2">
          <Field
            label="Descripción del caso"
            hint="Explique brevemente de qué trata, a quién representa y qué se busca. La IA usa esta descripción como contexto en cada escrito."
          >
            {(id) => (
              <Textarea id={id} rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} className="document-text" />
            )}
          </Field>
        </div>
        <Field label="Estado">
          {(id) => (
            <Select id={id} value={form.status} onChange={(e) => set('status', e.target.value as CaseInput['status'])}>
              <option value="activo">Activo</option>
              <option value="en_espera">En espera</option>
              <option value="cerrado">Cerrado</option>
            </Select>
          )}
        </Field>
        <div className="flex items-end">
          <Checkbox
            checked={form.localOnly}
            onChange={(v) => set('localOnly', v)}
            label="Caso confidencial (solo IA local)"
            hint="Los documentos de este caso nunca se enviarán a servicios de internet."
          />
        </div>
        {!existing && (
          <div className="rounded-lg bg-brand-50 p-4 md:col-span-2">
            <p className="font-semibold">¿Ya tiene los documentos de este cliente en una carpeta?</p>
            <p className="mb-3 text-muted">Se copiarán al caso (los originales no se modifican).</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={FolderOpen}
                onClick={async () => {
                  const folder = await invoke('app:pickFolder')
                  if (folder) setImportFolder(folder)
                }}
              >
                Elegir carpeta
              </Button>
              {importFolder && (
                <>
                  <span className="break-all font-medium">{importFolder}</span>
                  <Button variant="ghost" onClick={() => setImportFolder(null)}>
                    Quitar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
