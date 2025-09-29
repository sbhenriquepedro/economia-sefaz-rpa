import axios from 'axios'

import env from '@utils/env'
import logger from '@utils/logger'

const API_BASE_URL = env.API_PFX_MANAGER || 'http://localhost:5000'

export default class ApiPfxManager {
    private apiClient

    constructor() {
        this.apiClient = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
        })
    }

    async checkApiHealth() {
        try {
            const response = await this.apiClient.get(`/certificates`)
            if (response.status === 200) {
                logger.info(`API está acessível.`)
            } else {
                logger.warn(`API respondeu, mas com status diferente de 200.`)
            }
        } catch (error) {
            if (error instanceof Error) {
                logger.error(`Não foi possível acessar a API: ${error.message}`)
            } else {
                logger.error(`Erro desconhecido ao acessar a API.`)
            }
            process.exit(1)
        }
    }

    async clearCertificates(): Promise<void> {
        try {
            const response = await this.apiClient.post('/certificates/clear')
            logger.info(response.data.message || 'Certificados removidos com sucesso.')
        } catch (error) {
            logger.error(`Erro ao limpar certificados: ${error}`)
        }
    }
}
