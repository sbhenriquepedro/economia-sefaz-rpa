import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { DownloadNoteJob } from '@jobs/DownloadNoteJob'
import { QueueNoteJob } from '@jobs/QueueNoteJob'
import { ReportNoteJob } from '@jobs/ReportNoteJob'

import { ApiPfxManager } from '@utils/apiPfxManager'

import { connectDB } from '@utils/database'
import { logger } from '@utils/logger'
import { validateEnv } from '@utils/env'

yargs(hideBin(process.argv))
    .command('queue', 'Insere as notas na fila de download.', {}, async () => {
        try {
            logger.info('----------------------------------------')
            logger.info('Iniciando processo inserir as notas na fila de download.')

            validateEnv(['API_PFX_MANAGER', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_ENTRY', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_OUT', 'USER', 'PASSWORD'])
    
            await connectDB()
    
            const apiPfxManager = new ApiPfxManager()
            await apiPfxManager.checkApiHealth()
            
            const queueNoteJob = new QueueNoteJob()
            await queueNoteJob.run()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('----------------------------------------')
            logger.error(`Erro ao tentar inserir as notas na fila de download: ${message}`)
            process.exit(0)
        } finally {
            logger.info('----------------------------------------')
            logger.info('Processo de inserir as notas fiscais na fila finalizado.')
            process.exit(1)
        }
    })
    .command('download', 'Faz o download das notas fiscais.', {}, async () => {
        try {
            validateEnv(['API_PFX_MANAGER', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_ENTRY', 'FOLDER_TO_SAVE_XMLs_ROT_AUT_OUT', 'USER', 'PASSWORD'])
    
            await connectDB()
    
            const apiPfxManager = new ApiPfxManager()
            await apiPfxManager.checkApiHealth()
            
            const downloadNoteJob = new DownloadNoteJob()
            await downloadNoteJob.run()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('----------------------------------------')
            logger.error(`Erro ao tentar fazer download das notas fiscais: ${message}`)
            process.exit(0)
        } finally {
            logger.info('----------------------------------------')
            logger.info('Processo de download das notas fiscais finalizado.')
            process.exit(1)
        }
    })
    .command('report', 'Exporta o relatorio das notas fiscais em um arquivo Excel.', (yargs) => {
        return yargs
            .option('year', {
                alias: 'y',
                type: 'number',
                description: 'Ano do relatorio',
            })
            .option('month', {
                alias: 'm',
                type: 'number',
                description: 'Mes do relatorio (1-12)',
            })
    }, async (argv) => {
        try {
            await connectDB()

            logger.info('----------------------------------------')
            logger.info('Iniciando processo de exportar relatorio das notas fiscais em um arquivo Excel.')
            
            const now = new Date()
            const year = argv.year ?? now.getFullYear()
            const month = argv.month ?? (now.getMonth() + 1)
            
            await new ReportNoteJob().run(year, month)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error('----------------------------------------')
            logger.error(`Erro ao tentar exportar o relatorio das notas fiscais em um arquivo Excel: ${message}`)
            process.exit(0)
        } finally {
            logger.info('----------------------------------------')
            logger.info('Processo de exportar o relatorio das notas fiscais em um arquivo Excel finalizado.')
            process.exit(1)
        }
    })
    .demandCommand(1, 'Você precisa especificar um servico para executar.')
    .strict()
    .help()
    .parse()
