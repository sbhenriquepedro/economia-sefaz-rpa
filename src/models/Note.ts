import { Document, Schema, model } from 'mongoose'
import { IEmpresa } from './Empresa'

export type ModelNote = 0 | 55 | 65 // 0: Todos, 55: NF-e, 65: NFC-e
export type TypeNote = 0 | 1 // 0: Entrada, 1: Saída
export type StatusNote = 'Pending' | 'Processing' | 'Warning' | 'Error' | 'DonwloadPending' | 'Downloaded'

export interface INote extends Document {
    empresa: IEmpresa
    statusNote: StatusNote
    typeNote: TypeNote
    modelNote: ModelNote
    initialPeriod: Date
    finalPeriod: Date
    screenshot: string
    linkDownload?: string
    quantityNotes: number
    filePath?: string
    fileName?: string
    warn?: string
    canceled?: boolean
}

const NoteSchema: Schema = new Schema(
    {
        empresa: { type: Schema.Types.ObjectId, ref: 'Empresa', required: true },
        typeNote: { type: Number, required: true, enum: [ 0, 1 ], default: 0 }, // 0: Entrada, 1: Saída
        modelNote: { type: Number, required: true, enum: [ 0, 55, 65 ], default: 0 }, // 0: Todos, 55: NF-e, 57: CT-e, 65: NFC-e
        statusNote: { type: String, required: true, enum: [ 'Pending', 'Processing', 'Warning', 'Error', 'DonwloadPending', 'Downloaded' ], default: 'Pending' },
        initialPeriod: { type: Date, required: true },
        finalPeriod: { type: Date, required: true },
        screenshot: { type: String, required: false, default: '' },
        quantityNotes: { type: Number, required: false, default: 0 },
        linkDownload: { type: String, required: false, default: '' },
        filePath: { type: String, required: false, default: '' },
        fileName: { type: String, required: false, default: '' },
        warn: { type: String, required: false, default: '' },
        canceled: { type: Boolean, required: false, default: false }
    },
    { timestamps: true },
)

export default model<INote>('Note', NoteSchema)
