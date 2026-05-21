import path from "path"
import fs from "fs"

import { FilterQuery } from "mongoose"

import Note from "@models/Note"
import Company from "@models/Company"

import { logger } from "@utils/logger"

// Mapeamento dos modelos numéricos para string
const modelNoteLabels: Record<number, string> = {
    55: 'NF-e',
    65: 'NFC-e',
}

interface SituacaoData {
    hasNotes: boolean
    importedAt?: Date
    warn?: string
    statusNote?: string
}

interface ReportData {
    [period: string]: {
        [companyCode: number]: {
            [modelNote: string]: {
                Autorizadas: SituacaoData
                Canceladas: SituacaoData
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
            // Pega o último dia do mês final
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

    private emptySituacao(): SituacaoData {
        return { hasNotes: false }
    }

    private groupReportData(notes: any[]): ReportData {
        const data: ReportData = {}

        notes.forEach((note: any) => {
            const period = this.formatPeriod(note.initialPeriod)
            const companyCode = note.company.codeCompanieAccountSystem
            const modelNoteNum: number = note.modelNote

            // Só processa NF-e (55) e NFC-e (65)
            const modelLabel = modelNoteLabels[modelNoteNum]
            if (!modelLabel) return

            // canceled = true → Canceladas, false → Autorizadas
            const situacao: 'Autorizadas' | 'Canceladas' = note.canceled ? 'Canceladas' : 'Autorizadas'

            if (!data[period]) {
                data[period] = {}
            }

            if (!data[period][companyCode]) {
                data[period][companyCode] = {}
            }

            if (!data[period][companyCode][modelLabel]) {
                data[period][companyCode][modelLabel] = {
                    Autorizadas: this.emptySituacao(),
                    Canceladas: this.emptySituacao(),
                }
            }

            const hasNotes = note.quantityOfNotesDownloaded > 0
            const existing = data[period][companyCode][modelLabel][situacao]

            // Atualiza se ainda não tem notas mas este registro tem
            if (!existing.hasNotes && hasNotes) {
                data[period][companyCode][modelLabel][situacao] = {
                    hasNotes: true,
                    importedAt: note.updatedAt,
                    warn: note.warn,
                    statusNote: note.statusNote,
                }
            } else if (!existing.hasNotes) {
                // Preserva warn/statusNote do primeiro registro sem notas
                data[period][companyCode][modelLabel][situacao] = {
                    hasNotes: false,
                    importedAt: undefined,
                    warn: note.warn || existing.warn,
                    statusNote: note.statusNote || existing.statusNote,
                }
            }
        })

        return data
    }

    private formatSituacaoLine(situacao: string, sitData: SituacaoData | undefined): string {
        if (!sitData) {
            return `      - ${situacao}: Sem notas\n`
        }

        if (sitData.hasNotes && sitData.importedAt) {
            const importedDate = new Date(sitData.importedAt).toLocaleDateString('pt-BR')
            return `      - ${situacao}: Com notas (${importedDate})\n`
        }

        let warnMessage = ''
        if (sitData.warn) {
            // Trunca para a primeira linha para evitar stack traces multilinha no relatório
            const firstLine = sitData.warn.split(/\r?\n/)[0].trim()
            warnMessage = `(${firstLine})`
        } else if (sitData.statusNote === 'Error') {
            warnMessage = '(erro)'
        } else {
            warnMessage = '(Sem resultados encontrados!)'
        }

        return `      - ${situacao}: Sem notas ${warnMessage}\n`
    }

    private generateReportText(reportData: ReportData): string {
        const modelNotes = ['NF-e', 'NFC-e']
        const situacoes: Array<'Autorizadas' | 'Canceladas'> = ['Autorizadas', 'Canceladas']
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

                modelNotes.forEach((modelNote) => {
                    reportText += `    - ${modelNote}:\n`

                    const modelData = companies[companyCode][modelNote]

                    situacoes.forEach((situacao) => {
                        const sitData = modelData ? modelData[situacao] : undefined
                        reportText += this.formatSituacaoLine(situacao, sitData)
                    })
                })
            })

            // Adiciona linha em branco entre períodos (exceto no último)
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

            // Construir filtros
            const periodFilter = this.buildPeriodFilter(initialPeriod, finalPeriod)
            const companyCodes = this.buildCompanyFilter(companies)

            let query = Note.find(periodFilter).populate('company')

            // Se houver código de companies, filtrar
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

            // Agrupar dados
            const reportData = this.groupReportData(notes)

            // Gerar texto do relatório
            const reportText = this.generateReportText(reportData)

            // Criar pasta "data" se não existir
            const dataDir = path.join(process.cwd(), "data")
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir)
            }

            // Gerar nome do arquivo com data e hora local
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
