import path from "path"
import fs from "fs"

import { FilterQuery } from "mongoose"

import Note from "@models/Note"
import Company from "@models/Company"

import { logger } from "@utils/logger"

// Mapeamento dos campos numéricos para texto (igual ao NoteService)
const typeNoteLabels: Record<number, string> = {
    0: 'Entradas',
    1: 'Saidas',
}

const modelNoteLabels: Record<number, string> = {
    0: 'Todos',
    55: 'NF-e',
    65: 'NFC-e',
}

// Combinações válidas (igual ao QueueNoteJob.forEachCombination)
// typeNote=0 (Entradas): modelNote 55 e 65
// typeNote=1 (Saidas):   modelNote 0 (Todos)
const VALID_COMBINATIONS: Array<{ typeNote: number; modelNote: number }> = [
    { typeNote: 0, modelNote: 55 },
    { typeNote: 0, modelNote: 65 },
    { typeNote: 1, modelNote: 0  },
]

interface NoteData {
    hasNotes: boolean
    importedAt?: Date
    warn?: string
    statusNote?: string
    updatedAt?: Date  // usado para resolver duplicatas: sempre vence o mais recente
}

interface ReportData {
    [period: string]: {
        [companyCode: number]: {
            [typeLabel: string]: {
                [modelLabel: string]: NoteData
            }
        }
    }
}

export class ReportService {
    private parsePeriod(periodStr: string): { month: number; year: number } {
        const [month, year] = periodStr.split('/')
        const monthNum = parseInt(month, 10)
        const yearNum = parseInt(year, 10)

        if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
            throw new Error(`Formato de período inválido: ${periodStr}. Use MM/AAAA`)
        }

        return { month: monthNum, year: yearNum }
    }

    private buildPeriodFilter(
        initialPeriod?: string,
        finalPeriod?: string
    ): FilterQuery<typeof Note> {
        if (!initialPeriod && !finalPeriod) {
            return {}
        }

        const dateFilters: any[] = []

        if (initialPeriod) {
            const { month: initMonth, year: initYear } = this.parsePeriod(initialPeriod)
            const initDate = new Date(initYear, initMonth - 1, 1)
            dateFilters.push({ $gte: ["$initialPeriod", initDate] })
        }

        if (finalPeriod) {
            const { month: finalMonth, year: finalYear } = this.parsePeriod(finalPeriod)
            const endDate = new Date(finalYear, finalMonth, 0, 23, 59, 59)
            dateFilters.push({ $lte: ["$finalPeriod", endDate] })
        }

        if (dateFilters.length === 0) {
            return {}
        }

        return {
            $expr: {
                $and: dateFilters
            }
        }
    }

    private buildCompanyFilter(companies?: string): number[] | undefined {
        if (!companies) {
            return undefined
        }

        return companies
            .split(',')
            .map(code => parseInt(code.trim(), 10))
            .filter(code => !isNaN(code))
    }

    private formatPeriod(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${month}/${year}`
    }

    private isValidCombination(typeNote: number, modelNote: number): boolean {
        return VALID_COMBINATIONS.some(c => c.typeNote === typeNote && c.modelNote === modelNote)
    }

    private groupReportData(notes: any[]): ReportData {
        const data: ReportData = {}

        notes.forEach((note: any) => {
            const period = this.formatPeriod(note.initialPeriod)
            const companyCode = note.company.codeCompanieAccountSystem
            const typeNoteNum: number = note.typeNote
            const modelNoteNum: number = note.modelNote

            // Só processa combinações válidas (igual ao QueueNoteJob)
            if (!this.isValidCombination(typeNoteNum, modelNoteNum)) return

            const typeLabel  = typeNoteLabels[typeNoteNum]
            const modelLabel = modelNoteLabels[modelNoteNum]
            if (!typeLabel || !modelLabel) return

            // Inicializa estrutura
            if (!data[period]) data[period] = {}
            if (!data[period][companyCode]) data[period][companyCode] = {}
            if (!data[period][companyCode][typeLabel]) data[period][companyCode][typeLabel] = {}

            const hasNotes = note.quantityOfNotesDownloaded > 0
            const noteUpdatedAt: Date | undefined = note.updatedAt ? new Date(note.updatedAt) : undefined
            const existing = data[period][companyCode][typeLabel][modelLabel]
            const existingUpdatedAt: Date | undefined = existing?.updatedAt

            // Em caso de duplicatas, sempre prevalece o documento mais recente (updatedAt maior)
            const isNewer = !existingUpdatedAt ||
                (noteUpdatedAt && noteUpdatedAt > existingUpdatedAt)

            if (isNewer) {
                data[period][companyCode][typeLabel][modelLabel] = {
                    hasNotes,
                    importedAt: hasNotes ? noteUpdatedAt : undefined,
                    warn: note.warn,
                    statusNote: note.statusNote,
                    updatedAt: noteUpdatedAt,
                }
            }
        })

        return data
    }

    private formatNoteLine(modelLabel: string, noteData: NoteData | undefined): string {
        if (!noteData) {
            return `      - ${modelLabel}: Sem notas\n`
        }

        if (noteData.hasNotes && noteData.importedAt) {
            const importedDate = new Date(noteData.importedAt).toLocaleDateString('pt-BR')
            return `      - ${modelLabel}: Com notas (${importedDate})\n`
        }

        let warnMessage = ''
        if (noteData.warn) {
            // Trunca à primeira linha para evitar stack traces multilinha
            const firstLine = noteData.warn.split(/\r?\n/)[0].trim()
            warnMessage = `(${firstLine})`
        } else if (noteData.statusNote === 'Error') {
            warnMessage = '(erro)'
        } else {
            warnMessage = '(Sem resultados encontrados!)'
        }

        return `      - ${modelLabel}: Sem notas ${warnMessage}\n`
    }

    private generateReportText(reportData: ReportData): string {
        // Modelos válidos por tipo (ordem de exibição)
        const modelsByType: Record<string, string[]> = {
            'Entradas': ['NF-e', 'NFC-e'],
            'Saidas':   ['Todos'],
        }

        const typeOrder = ['Entradas', 'Saidas']
        let reportText = ''

        // Ordena os períodos do mais recente ao mais antigo
        const sortedPeriods = Object.keys(reportData).sort((a, b) => {
            const [monthA, yearA] = a.split('/').map(Number)
            const [monthB, yearB] = b.split('/').map(Number)
            if (yearA !== yearB) return yearB - yearA
            return monthB - monthA
        })

        sortedPeriods.forEach((period, periodIndex) => {
            reportText += `${period}:\n`

            const companies = reportData[period]
            const sortedCompanies = Object.keys(companies)
                .map(Number)
                .sort((a, b) => a - b)

            sortedCompanies.forEach((companyCode) => {
                reportText += `  - ${companyCode}:\n`

                typeOrder.forEach((typeLabel) => {
                    reportText += `    - ${typeLabel}:\n`

                    const models = modelsByType[typeLabel]
                    models.forEach((modelLabel) => {
                        const noteData = companies[companyCode]?.[typeLabel]?.[modelLabel]
                        reportText += this.formatNoteLine(modelLabel, noteData)
                    })
                })
            })

            // Linha em branco entre períodos (exceto no último)
            if (periodIndex < sortedPeriods.length - 1) {
                reportText += '\n'
            }
        })

        return reportText
    }

    public async generateNotesReport(
        companies?: string,
        initialPeriod?: string,
        finalPeriod?: string
    ): Promise<void> {
        try {
            logger.info('----------------------------------------')
            logger.info(`Gerando relatorio das notas fiscais.`)
            logger.info(`Parametros: companies=${companies || 'todos'}, initialPeriod=${initialPeriod || 'todos'}, finalPeriod=${finalPeriod || 'todos'}`)

            const periodFilter = this.buildPeriodFilter(initialPeriod, finalPeriod)
            const companyCodes = this.buildCompanyFilter(companies)

            // Ordena do mais recente: em caso de duplicatas, o mais recente prevalece
            let query = Note.find(periodFilter).sort({ updatedAt: -1 }).populate('company')

            if (companyCodes && companyCodes.length > 0) {
                const companyDocs = await Company.find({
                    codeCompanieAccountSystem: { $in: companyCodes }
                })
                const companyIds = companyDocs.map(c => c._id)
                query = query.where('company').in(companyIds)
            }

            const notes = await query.exec()

            logger.info(`Total de notas encontradas: ${notes.length}`)

            if (notes.length === 0) {
                logger.warn('Nenhuma nota encontrada com os critérios especificados.')
            }

            const reportData = this.groupReportData(notes)
            const reportText = this.generateReportText(reportData)

            // Cria pasta "data" se não existir
            const dataDir = path.join(process.cwd(), "data")
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir)
            }

            // Nome do arquivo com data e hora local
            const now = new Date()
            const formattedDate = now.toLocaleDateString("pt-BR").replace(/\//g, "-")
            const formattedTime = now.toLocaleTimeString("pt-BR").replace(/:/g, "-")
            const fileName = `relatorio_notas_${formattedDate}_${formattedTime}.txt`

            const filePath = path.join(dataDir, fileName)
            fs.writeFileSync(filePath, reportText, 'utf-8')
            logger.info(`Exportacao concluida: ${filePath}.`)
        } catch (err) {
            logger.error("Erro ao gerar relatório:", err)
            throw err
        } finally {
            logger.info('----------------------------------------')
            logger.info(`Relatorio das notas fiscais finalizado.`)
        }
    }
}
