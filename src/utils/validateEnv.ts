import env from './env'

export function validateEnv(requiredKeys: string[]): void {
    const missingKeys = requiredKeys.filter(key => !env[key])

    if (missingKeys.length > 0) {
        console.error(`Variáveis de ambiente ausentes ou inválidas: ${missingKeys.join(', ')}`)
        process.exit(1)
    }
}