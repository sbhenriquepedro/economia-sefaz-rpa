import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import DownloadNoteJob from '@jobs/DownloadNoteJob'
import QueueNoteJob from '@jobs/QueueNoteJob'

import ApiPfxManager from '@services/ApiPFXManager'

import logger from '@utils/logger'
import { connectDB } from '@utils/database'
import { exportNotes } from '@utils/exportNotes'
import { validateEnv } from '@utils/validateEnv'

const REQUIRED_ENV_VARS = ['API_PFX_MANAGER', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_ENTRY', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_OUT']

async function main() {
    try {
        await connectDB()

        const apiPfxManager = new ApiPfxManager()
        await apiPfxManager.checkApiHealth()

        validateEnv(REQUIRED_ENV_VARS)
    } catch (error) {
        logger.error(`Erro na inicialização da aplicação`)
        console.error(error)
        process.exit(1)
    }
}

yargs(hideBin(process.argv))
    .command('queueNoteJob', 'Executa o job de inserir download da nota na fila', {}, async () => {
        await main()
        
        const queueNoteJob = new QueueNoteJob()
        await queueNoteJob.run()
    })
    .command('downloadNoteJob', 'Executa o job de download de nota', {}, async () => {
        await main()
        
        const downloadNoteJob = new DownloadNoteJob()
        await downloadNoteJob.run()
    })
    .command('exportNotes', 'Exporta as notas para um arquivo Excel', {}, async () => {
        await connectDB()
        const exporter = new exportNotes()
        await exporter.run()
    })
    .demandCommand(1, 'Você precisa especificar um job para executar.')
    .strict()
    .help()
    .parse()
