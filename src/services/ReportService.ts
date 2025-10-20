import path from "path"
import fs from "fs"

import { FilterQuery } from "mongoose"
import ExcelJS from "exceljs"

import Note, { typeNoteMap, modelNoteMap, statusNoteMap } from "@models/Note"

import { logger } from "@utils/logger"

export class ReportService {
    private buildPeriodFilter(monthSearch: number = 0): FilterQuery<typeof Note> {
        const now = new Date()
        let year = now.getFullYear()
        let month = monthSearch ?? now.getMonth() + 1 // getMonth() retorna 0-11
    
        if (now.getDate() <= 5) {
            month -= 1
            if (month === 0) {
                month = 12
                year -= 1
            }
        }
    
        return {
            $expr: {
                $and: [
                    { $eq: [{ $month: "$initialPeriod" }, month] },
                    { $eq: [{ $year: "$initialPeriod" }, year] },
                    { $eq: [{ $month: "$finalPeriod" }, month] },
                    { $eq: [{ $year: "$finalPeriod" }, year] },
                ]
            }
        }
    }

    public async generateNotesReport(monthSearch: number = 0): Promise<void> {
        try {
            logger.info('----------------------------------------')
            logger.info(`Gerando relatorio das notas do mes: ${String(monthSearch).padStart(2, '0')}`)

            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet("Notas")
            
            worksheet.columns = [
                { header: "Código", key: "companyCodeCompanieAccountSystem", width: 15 },
                { header: "Empresa", key: "companyName", width: 30 },
                { header: "CNPJ", key: "companyFederalRegistration", width: 20 },
                { header: "Tipo", key: "typeNote", width: 15 },
                { header: "Modelo", key: "modelNote", width: 10 },
                { header: "Status", key: "statusNote", width: 15 },
                { header: "Período Inicial", key: "initialPeriod", width: 15 },
                { header: "Período Final", key: "finalPeriod", width: 15 },
                { header: "Qtd. Notas Encontradas", key: "quantityOfNotesFound", width: 15 },
                { header: "Qtd. Notas Baixadas", key: "quantityOfNotesDownloaded", width: 15 },
                { header: "Arquivo", key: "fileName", width: 40 },
                { header: "Cancelada", key: "canceled", width: 40 },
            ]
            
            const filter = this.buildPeriodFilter(monthSearch)
            const notes = await Note.find(filter).populate('company')

            notes.forEach((note: any) => {
                const { codeCompanieAccountSystem: companyCodeCompanieAccountSystem, name: companyName, federalRegistration: companyFederalRegistration } = note.company
                const typeNote = typeNoteMap[note.typeNote] || note.typeNote || ""
                const modelNote = modelNoteMap[note.modelNote] || note.modelNote || ""
                const statusNote = statusNoteMap[note.statusNote] || note.statusNote || ""
                const initialPeriod = note.initialPeriod ? new Date(note.initialPeriod).toISOString().split("T")[0] : ""
                const finalPeriod = note.finalPeriod ? new Date(note.finalPeriod).toISOString().split("T")[0] : ""
                const { quantityOfNotesFound, quantityOfNotesDownloaded, fileName, canceled } = note

                logger.info('----------------------------------------')
                logger.info(`Empresa: ${companyName}(${companyCodeCompanieAccountSystem}),`)
                logger.info(`Modelo: ${modelNote},`)
                logger.info(`typeNote: ${typeNote},`)
                logger.info(`Periodo Inicial: ${initialPeriod},`)
                logger.info(`Periodo Final: ${finalPeriod},`)
                logger.info(`Qtd. Notas Encontradas: ${quantityOfNotesFound}.`)
                logger.info(`Qtd. Notas Baixadas: ${quantityOfNotesDownloaded}.`)
                logger.info(`Nome do Arquivo: ${fileName || 'Sem nome'}.`)
                logger.info(`Cancelada? ${canceled ? 'Sim' : 'Não'}.`)

                worksheet.addRow({
                    companyCodeCompanieAccountSystem,
                    companyName,
                    companyFederalRegistration,
                    typeNote,
                    modelNote,
                    statusNote,
                    initialPeriod,
                    finalPeriod,
                    quantityOfNotesFound,
                    quantityOfNotesDownloaded,
                    fileName,
                    canceled: canceled ? 'Sim' : 'Não'
                })
            })

            // Criar pasta "data" se não existir
            const dataDir = path.join(process.cwd(), "data")
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir)
            }

            // Gerar nome do arquivo com data e hora local
            const now = new Date()
            const formattedDate = now.toLocaleDateString("pt-BR").replace(/\//g, "-")
            const formattedTime = now.toLocaleTimeString("pt-BR").replace(/:/g, "-")
            const fileName = `relatorio_notas_${formattedDate}_${formattedTime}.xlsx`

            const filePath = path.join(dataDir, fileName)

            await workbook.xlsx.writeFile(filePath)
            logger.info(`Exportacao concluida: ${filePath}.`)
        } catch (err) {
            logger.error("Erro:", err)
        } finally {
            logger.info('----------------------------------------')
            logger.info(`Relatorio das notas do mes: ${String(monthSearch).padStart(2, '0')} finalizado.`)
        }
    }
}
