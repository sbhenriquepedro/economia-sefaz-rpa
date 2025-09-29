import Empresa, { IEmpresa } from '@models/Empresa'
import Note, { StatusNote } from "@models/Note"

import ApiPfxManager from '@services/ApiPFXManager'
import NoteService from '@services/NoteService'

import env from "@utils/env"
import logger from '@utils/logger'
import { getPeriodDates } from '@utils/period'

export default class QueueNoteJob {
    companiesToDownload = env.COMPANIES_TO_DOWNLOAD ? env.COMPANIES_TO_DOWNLOAD.split(',').map((id) => id.trim()) : null
    periods = getPeriodDates()

    private async checkNoteIfCanProcess(codigo: string): Promise<boolean> {
        if (this.companiesToDownload && !this.companiesToDownload.includes(codigo)) return false
        return true
    }

    protected async forEachCombination(
        callback: (args: {
            typeNote: number
            modelNote: number
            initialPeriod: Date
            finalPeriod: Date
        }) => Promise<void | boolean>
    ) {
        for (const typeNote of [ 0, 1 ]) {
            for (const modelNote of [ 0, 55, 65 ]) {
                for (const { initialPeriod, finalPeriod } of this.periods) {
                    if (typeNote === 0 && modelNote === 0) continue
                    if (typeNote === 1 && modelNote !== 0) continue

                    const result = await callback({ typeNote, modelNote, initialPeriod, finalPeriod })
                    if (result === false) continue 
                }
            }
        }
    }

    private async createNoteNonexistent (empresa: IEmpresa): Promise<void> {
        await this.forEachCombination(async ({ typeNote, modelNote, initialPeriod, finalPeriod }) => {
            const existingNote = await Note.findOne({
                empresa: empresa._id,
                modelNote, typeNote,
                initialPeriod, finalPeriod
            })

            if (!existingNote) {
                await Note.create({
                    empresa: empresa._id,
                    typeNote,
                    modelNote,
                    initialPeriod,
                    finalPeriod,
                    screenshot: '',
                    quantityNotes: 0,
                })
            }
        })
    }

    private async putNoteInQueue(empresa: IEmpresa, status: StatusNote[] = ['Pending', 'Error', 'Processing']): Promise<void> {
        const canProcess = await this.checkNoteIfCanProcess(empresa.codigo)
        if (!canProcess) return

        await this.createNoteNonexistent(empresa)
 
        await this.forEachCombination(async ({ typeNote, modelNote, initialPeriod, finalPeriod }) => {
            try {
                const note = await Note.findOne({
                    empresa: empresa._id,
                    typeNote, modelNote,
                    initialPeriod, finalPeriod,
                })

                const company = await Empresa.findById(note?.empresa)
                
                if (note != null && status.includes(note.statusNote)) {
                    logger.info('----------------------------------------')
                    logger.info(`Empresa: ${empresa.nome} (${empresa.codigo}),`)
                    logger.info(`Modelo: ${modelNote},`)
                    logger.info(`Tipo: ${typeNote},`)
                    logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                    
                    const apiPfxManager = new ApiPfxManager()
                    await apiPfxManager.clearCertificates()
                    
                    if (empresa.cnpj) {
                        const noteService = new NoteService(company, note)
                        await noteService.setDownloadLink()
                    } else {
                        await Note.findByIdAndUpdate(note._id, { statusNote: 'Error', warn: `Empresa sem CNPJ (${empresa.cnpj}).` })
                    }
                }
            } catch (error) {
                logger.info('----------------------------------------')
                logger.info(`Erro ao processar a empresa: ${empresa.nome} (${empresa.cnpj}),`)
                logger.info(`Modelo: ${modelNote},`)
                logger.info(`Tipo: ${typeNote},`)
                logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                
                const message = error instanceof Error ? error.message : String(error)

                await Note.findOneAndUpdate({
                    empresa: empresa._id,
                    typeNote, modelNote,
                    initialPeriod, finalPeriod
                }, {
                    statusNote: 'Error',
                    warn: `Erro ao processar a nota: ${message}`,
                })
            }
        })
    }
    
    async run(): Promise<void> {
        try {
            const companies = await Empresa.find({
                ie: { $ne: "", $exists: true },
                fly: true,
                situacao: "A"
            })

            logger.info(`Quantidade de empresas ativas: ${companies.length}`)
            
            for (const empresa of companies) {
                await this.putNoteInQueue(empresa)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Erro ao tentar colocar as notas na fila de donwload no sefaz: ${message}`)
        }
    }
}
