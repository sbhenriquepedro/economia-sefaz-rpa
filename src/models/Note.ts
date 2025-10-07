import { Document, Schema, model } from 'mongoose'
import { ICompany } from './Company'

export const typeNoteMap: Record<number, string> = {
    0: 'Entrada',
    1: 'Saída',
}

export const modelNoteMap: Record<number, string> = {
    0: 'Todos',
    55: 'NF-e',
    65: 'NFC-e'
}

export const statusNoteMap: Record<string, string> = {
    Pending: "Pendente",
    Processing: "Processando",
    Warning: "Aviso",
    Error: "Erro",
    DonwloadPending: "Baixa Pendente",
    Downloaded: "Baixada",
}

export type ModelNote = 0 | 55 | 65
export type TypeNote = 0 | 1
export type StatusNote = 'Pending' | 'Processing' | 'Warning' | 'Error' | 'DonwloadPending' | 'Downloaded'

export interface INote extends Document {
    company: ICompany
    statusNote: StatusNote
    typeNote: TypeNote
    modelNote: ModelNote
    initialPeriod: Date
    finalPeriod: Date
    screenshot: string
    linkDownload?: string
    quantityOfNotesFound: number
    quantityOfNotesDownloaded: number
    filePath?: string
    fileName?: string
    warn?: string
    canceled?: Boolean
    createdAt: Date
    updatedAt: Date
}

const NoteSchema: Schema = new Schema(
    {
        company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
        typeNote: { type: Number, required: true, enum: [ 0, 1 ], default: 0 }, 
        modelNote: { type: Number, required: true, enum: [ 0, 55, 65 ], default: 0 },
        statusNote: { type: String, required: true, enum: [ 'Pending', 'Processing', 'Warning', 'Error', 'DonwloadPending', 'Downloaded' ], default: 'Pending' },
        initialPeriod: { type: Date, required: true },
        finalPeriod: { type: Date, required: true },
        screenshot: { type: String, required: false, default: '' },
        quantityOfNotesFound: { type: Number, required: false, default: 0 },
        quantityOfNotesDownloaded: { type: Number, required: false, default: 0 },
        linkDownload: { type: String, required: false, default: '' },
        filePath: { type: String, required: false, default: '' },
        fileName: { type: String, required: false, default: '' },
        warn: { type: String, required: false, default: '' },
        canceled: { type: Boolean, required: false, default: false },
    },
    { timestamps: true },
)

export default model<INote>('Note', NoteSchema)
