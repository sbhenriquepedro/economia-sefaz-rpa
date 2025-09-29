import Note from '@models/Note'

import logger from '@utils/logger'

export class AuditService {
    async removeNotesFromInactiveCompanies() {
        try {
            const notes = await Note.find().populate('company')
    
            for (const note of notes) {
                if (note.company?.status !== "A") {
                    await note.deleteOne()
                    logger.info(`Nota ${note._id} removida (empresa inativa).`)
                }
            }

            logger.info("Processo de retirar as notas de empresas inativas finalizado com sucesso.")
        } catch (error) {
            logger.error("Erro ao tentar excluir as notas inativas")
            console.error(error)
        } finally {
            process.exit(1)
        }
    }
}
