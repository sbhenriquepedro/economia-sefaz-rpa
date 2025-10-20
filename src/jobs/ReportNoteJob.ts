import { ReportService } from '@services/ReportService'

import { logger } from '@utils/logger'

export class ReportNoteJob {
    public async run(): Promise<void> {
        try {
            const reportService = new ReportService()
            await reportService.generateNotesReport(10)
        } catch (error) {
            logger.error(`Erro ao realizar o relatorio das notas fiscais.`)
            console.error(error)
        }
    }
}
