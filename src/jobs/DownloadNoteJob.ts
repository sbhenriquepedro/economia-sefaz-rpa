import Empresa, { IEmpresa } from '@models/Empresa'
import Note from '@models/Note'

import NoteService from '@services/NoteService'

import env from '@utils/env'
import logger from '@utils/logger'

export default class DownloadNoteJob {
    companiesToDownload = env.COMPANIES_TO_DOWNLOAD ? env.COMPANIES_TO_DOWNLOAD.split(',').map((id: string) => Number(id.trim())) : null

    async run() {
        try {
            while (true) {
                const notes = await Note.find({
                    linkDownload: { $exists: true, $ne: "" },
                    statusNote: 'DonwloadPending'
                })
                
                for (const note of notes) {
                    const empresa = await Empresa.findById(note?.empresa)

                    if (this.companiesToDownload && !this.companiesToDownload.includes(empresa.codigo)) {
                        logger.info(`Empresa ${empresa.nome} (${empresa.codigo}) não está na lista de empresas para download. Pulando...`)
                        return
                    }
                    
                    logger.info('********************************')
    
                    logger.info(`Iniciando download da empresa: ${empresa.nome} (${empresa.codigo}),`)
                    logger.info(`Modelo: ${note.modelNote},`)
                    logger.info(`Tipo: ${note.typeNote},`)
                    logger.info(`Periodo: ${note.initialPeriod.toLocaleDateString()} - ${note.finalPeriod.toLocaleDateString()}.`)
    
                    await new NoteService(empresa, note).downloadFile()
                }

                await new Promise((resolve) => setTimeout(resolve, 1000 * 60))
            }
        } catch (error) {
            logger.error(`Erro ao realizar o download da empresa.`)
            console.error(error)
        }
    }
}
