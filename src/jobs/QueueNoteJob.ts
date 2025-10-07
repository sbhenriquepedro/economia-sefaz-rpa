import Company, { ICompany } from '@models/Company'
import Note, { StatusNote } from "@models/Note"

import { ApiPfxManager } from '@utils/apiPfxManager'
import { NoteService } from '@services/NoteService'

import { env } from "@utils/env"
import { logger } from '@utils/logger'
import { getPeriodDates } from '@utils/period'

export class QueueNoteJob {
    companiesToDownload = env.COMPANIES_TO_DOWNLOAD ? env.COMPANIES_TO_DOWNLOAD.split(',').map((id) => Number(id.trim())) : null
    periods = getPeriodDates()

    private async checkNoteIfCanProcess(codeCompanieAccountSystem: number): Promise<boolean> {
        if (this.companiesToDownload && !this.companiesToDownload.includes(codeCompanieAccountSystem)) return false
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

    private async createNoteNonexistent (company: ICompany): Promise<void> {
        await this.forEachCombination(async ({ typeNote, modelNote, initialPeriod, finalPeriod }) => {
            const existingNote = await Note.findOne({
                company: company._id,
                modelNote, typeNote,
                initialPeriod, finalPeriod
            })

            if (!existingNote) {
                await Note.create({
                    company: company._id,
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

    private async putNoteInQueue(company: ICompany, canceled: Boolean = false, status: StatusNote[] = ['Pending', 'Error', 'Processing']): Promise<void> {
        const canProcess = await this.checkNoteIfCanProcess(company.codeCompanieAccountSystem)
        if (!canProcess) return

        await this.createNoteNonexistent(company)
 
        await this.forEachCombination(async ({ typeNote, modelNote, initialPeriod, finalPeriod }) => {
            try {
                const note = await Note.findOne({
                    company: company._id,
                    typeNote, modelNote,
                    initialPeriod, finalPeriod
                }).populate('company')

                
                if (note != null && status.includes(note.statusNote)) {
                    logger.info('----------------------------------------')
                    logger.info(`Empresa: ${company.name} (${company.codeCompanieAccountSystem}),`)
                    logger.info(`Modelo: ${modelNote},`)
                    logger.info(`Tipo: ${typeNote},`)
                    logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                    
                    const apiPfxManager = new ApiPfxManager()
                    await apiPfxManager.clearCertificates()

                    note.canceled = canceled

                    if (company.federalRegistration) {
                        const noteService = new NoteService(note)
                        await noteService.setDownloadLink()
                    } else {
                        await Note.findByIdAndUpdate(note._id, { statusNote: 'Error', warn: `Empresa sem CNPJ (${company.federalRegistration}).` })
                    }
                }
            } catch (error) {
                logger.info(`Erro ao processar a empresa: ${company.name} (${company.codeCompanieAccountSystem}),`)
                logger.info(`Modelo: ${modelNote},`)
                logger.info(`Tipo: ${typeNote},`)
                logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                
                const message = error instanceof Error ? error.message : String(error)

                await Note.findOneAndUpdate({
                    company: company._id,
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
            const companies = await Company.find({
                $and: [
                    { stateRegistration: { $ne: "", $exists: true } },
                    { stateRegistration: { $ne: null, $exists: true } },
                ],
                status: "A"
            })

            logger.info(`Quantidade de empresas ativas: ${companies.length}`)
            
            for (const company of companies) {
                await this.putNoteInQueue(company)
                await this.putNoteInQueue(company, true)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Erro ao tentar colocar as notas na fila de donwload no sefaz: ${message}`)
        }
    }
}
