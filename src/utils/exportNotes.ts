import fs from "fs"
import path from "path"
import ExcelJS from "exceljs"
import { FilterQuery } from "mongoose"

import Note from "@models/Note"
import Company from "@models/Company"

import logger from "./logger"

function buildPeriodFilter(): FilterQuery<typeof Note> {
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() + 1 // getMonth() retorna 0-11

    // Se for dia 1 a 5, usar mês anterior
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
            ],
        },
    };
}

// Mapa de tradução dos status
const statusMap: Record<string, string> = {
    Success: "Sucesso",
    Warning: "Aviso",
    Error: "Erro",
    Pending: "Pendente",
    Processing: "Processando",
    DonwloadPending: "Pedente de Donwload"
}

const modelMap: Record<number, string> = {
    0: "Todos",
    55: "NF-e",
    65: "NFC-e"
}

const typeMap: Record<number, string> = {
    0: "Entrada",
    1: "Saida",
}

export class exportNotes {
    async run() {
        try {
            // Buscar todas as notas
            const filter = buildPeriodFilter()

            const notes = await Note.find(filter)
    
            // Buscar todas as empresas referenciadas de uma vez só
            const companyIds = [...new Set(notes.map((note: any) => note.company?.toString()).filter(Boolean))]
            const companies = await Company.find({ _id: { $in: companyIds } })
            const companyMap = new Map(companies.map((c: any) => [c._id.toString(), c]))
    
            // Montar workbook
            const workbook = new ExcelJS.Workbook()
            const worksheet = workbook.addWorksheet("Notas")
    
            worksheet.columns = [
                { header: "Código", key: "companyCodeCompanieAccountSystem", width: 15 },
                { header: "Empresa", key: "companyName", width: 30 },
                { header: "CNPJ", key: "companyCnpj", width: 20 },
                { header: "Info", key: "warn", width: 20 },
                { header: "Modelo", key: "modelNote", width: 10 },
                { header: "Tipo", key: "typeNote", width: 10 },
                { header: "Status", key: "statusNote", width: 15 },
                { header: "Período Inicial", key: "initialPeriod", width: 15 },
                { header: "Período Final", key: "finalPeriod", width: 15 },
                { header: "Arquivo", key: "fileName", width: 40 },
            ]
    
            notes.forEach((note: any) => {
                const company = note.company ? companyMap.get(note.company.toString()) : null
    
                worksheet.addRow({
                    companyCodeCompanieAccountSystem: company?.codeCompanieAccountSystem || "",
                    companyName: company?.name || "",
                    companyCnpj: company?.federalRegistration || "",
                    warn: note.warn || "",
                    modelNote: modelMap[note.modelNote] || "",
                    typeNote: typeMap[note.typeNote] || "",
                    statusNote: statusMap[note.statusNote] || note.statusNote || "",
                    initialPeriod: note.initialPeriod
                        ? new Date(note.initialPeriod).toISOString().split("T")[0]
                        : "",
                    finalPeriod: note.finalPeriod
                        ? new Date(note.finalPeriod).toISOString().split("T")[0]
                        : "",
                    quantityNotes: note.quantityNotes ?? "",
                    fileName: note.fileName || "",
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
            const fileName = `notas_exportadas_${formattedDate}_${formattedTime}.xlsx`
    
            const filePath = path.join(dataDir, fileName)
    
            await workbook.xlsx.writeFile(filePath)
            logger.info(`Exportação concluída: ${filePath}`)
            process.exit(0)
        } catch (err) {
            logger.error("Erro:", err)
            process.exit(1)
        }
    }
}
