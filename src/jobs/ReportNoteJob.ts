import { ReportService } from '@services/ReportService'

import { logger } from '@utils/logger'

export class ReportNoteJob {
    public async run(year: number, month: number): Promise<void> {
        try {
            const reportService = new ReportService()
            await reportService.generateNotesReport(year, month)
        } catch (error) {
            logger.error(`Erro ao realizar o relatorio das notas fiscais.`)
            console.error(error)
        }
    }
}
