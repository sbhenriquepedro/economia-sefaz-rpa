import { chromium, Browser, BrowserContext, Page, Frame } from "playwright"
import path from "path"
import fs from "fs"

import Note, { INote } from "@models/Note"

import env from "@utils/env"
import logger from "@utils/logger"

interface IRow {
    sit: string
    file: string
    date: string
    obs: string
    linkDownload?: string
}

export interface IFields {
    companyNameWithCode?: string
    companyCodeWithDash?: string
    modelNotaFiscal: string
    typeNF: string
    situacaoNFDescription: string
    year?: string
    month?: string
    monthAndYear?: string
}

export default class NoteService {
    note: INote
    browser!: Browser
    context!: BrowserContext
    page!: Page
    continue: boolean
    iframeContent?: Frame

    constructor(note: INote) {
        this.note = note
        this.continue = true
    }

    private treateTextField (value: string): string {
        const result = value.trim().normalize('NFD').replace(/([\u0300-\u036f]|[^0-9a-zA-Z ])/g, '').toUpperCase()
        return this.minimalizeSpaces(result)
    }

    private minimalizeSpaces (text: string): string {
        let result = text
        while (result.indexOf('  ') >= 0) {
            result = result.replace('  ', ' ')
        }
        return result.trim()
    }

    private modelNotaFiscal(modelo: number): Promise<string> {
        return new Promise((resolve) => {
            if (modelo === 55) resolve('NF-e')
            else if (modelo === 57) resolve('CT-e')
            else if (modelo === 65) resolve('NFC-e')
            else resolve('Todos')
        })
    }

    private zeroLeft (valueInsert: string, countZeros: number = 2): string {
        return ('0000'.repeat(countZeros) + valueInsert).slice(-countZeros)
    }

    private getNameTypeNF(type: number): Promise<string> {
        return new Promise((resolve) => {
            if (type === 0) resolve('Entradas')
            else if (type === 1) resolve('Saidas')
            else resolve('Desconhecido')
        })
    }

    private mountFolder(folder: string, aut: boolean = false): Promise<string> {
        return new Promise(async (resolve) => {
            const fields = new Object({}) as IFields
            const nameCompany = this.treateTextField(this.note.company.name).substring(0, 70) ?? 'SEM_NOME'
            const codeCompany = this.note.company.codeCompanieAccountSystem ?? '000000000'

            if (aut) {
                // cgce, codeCompanieWithNameCompanie, monthYear, monthYear
                fields.modelNotaFiscal = await this.modelNotaFiscal(this.note.modelNote)
                fields.companyCodeWithDash = `${codeCompany}-`
                fields.monthAndYear = `${this.zeroLeft(
                    String(this.note.initialPeriod.getMonth() + 1),
                    2
                )}${this.note.initialPeriod.getFullYear().toString()}`
            } else {
                fields.companyNameWithCode = `${nameCompany} - ${codeCompany}`
                fields.year = this.note.initialPeriod.getFullYear().toString()
                fields.month = this.zeroLeft(this.note.initialPeriod.toString(), 2)
                fields.typeNF = await this.getNameTypeNF(this.note.typeNote)
                fields.modelNotaFiscal = await this.modelNotaFiscal(this.note.modelNote)
            }

            const parts = new Array(0) as Array<string>
            for (const [key, value] of Object.entries(fields)) {
                if (value) {
                    parts.push(value)
                }
            }

            const folderComplete = path.resolve(
                path.join(folder, parts.join('//'))
            )

            fs.existsSync(folderComplete) ||
                fs.mkdirSync(folderComplete, { recursive: true })

            resolve(folderComplete)
        })
    }

    private createFolderToSaveData(): Promise<string> {
        return new Promise(async (resolve) => {
            const folderToSaveXMLsRotinaAutomaticaEntrada = env.FOLDER_TO_SAVE_XMLs_ROT_AUT_ENTRY
            const folderToSaveXMLsRotinaAutomaticaSaida = env.FOLDER_TO_SAVE_XMLs_ROT_AUT_OUT

            if (this.note.company.codeCompanieAccountSystem) {
                if (
                    this.note.typeNote === 0 &&
                    folderToSaveXMLsRotinaAutomaticaEntrada
                ) {
                    resolve(
                        await this.mountFolder(
                            folderToSaveXMLsRotinaAutomaticaEntrada,
                            true
                        )
                    )
                } else if (
                    this.note.typeNote === 1 &&
                    folderToSaveXMLsRotinaAutomaticaSaida
                ) {
                    resolve(
                        await this.mountFolder(
                            folderToSaveXMLsRotinaAutomaticaSaida,
                            true
                        )
                    )
                } else {
                    resolve('')
                }
            }
        })
    }

    private async screenshot(pathname: string): Promise<string> {
        if (!this.page.isClosed()) {
            const dateTimeString = new Date().toLocaleString().replace(/[^a-zA-Z0-9]/g, '')
            const name = `${dateTimeString}.png`
            const pathScreenshot = path.join(`${pathname}\\prints`, name)
            await this.page.screenshot({ path: path.resolve(pathScreenshot) })
            return pathScreenshot
        }

        return ""
    }

    async extractFirstRowTable(): Promise<IRow> {
        // Aguarda a tabela estar visível
        await this.iframeContent?.waitForSelector('table.tablesorter tbody tr')

        // Seleciona a primeira linha da tabela
        const firstRow = this.iframeContent?.locator('table.tablesorter tbody tr').first()

        if (!firstRow) {
            throw new Error('Não foi possível encontrar a primeira linha da tabela.')
        }

        // Extrai os dados das colunas
        const sit = await firstRow.locator('.col-situacao').innerText()
        const file = await firstRow.locator('.col-arquivo').innerText()
        const date = await firstRow.locator('.col-data').innerText()
        const obs = await firstRow.locator('.col-observacoes').innerText()
        // const linkDownload = await firstRow.locator('.col-acoes a.btn-info').getAttribute('href')

        // Retorna o objeto com os dados
        return { sit, file, date, obs }
    }

    private async addToDownloadQueue(): Promise<void> {
        if (!this.continue) return

        try {
            await this.getIframeContent()

            await this.iframeContent?.getByRole('button', { name: 'Baixar todos os arquivos' }).click()

            const downloadButton = this.iframeContent?.getByRole('button', { name: 'Baixar', exact: true })
            await downloadButton?.evaluate((button: HTMLButtonElement) => button.removeAttribute('disabled'))
            await downloadButton?.click()

            const iframeUrl = this.iframeContent?.url()

            if (!iframeUrl) {
                logger.warn('Não foi possível localizar o iframe com nome "iNetaccess".')
            }

            const url = iframeUrl

            const { file } = await this.extractFirstRowTable()

            if (url && file) {
                logger.info(`URL do download: ${url}`)
                logger.info(`Nome do arquivo: ${file}`)
                
                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        typeNote: this.note.typeNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        fileName: file,
                        linkDownload: url,
                        statusNote: 'DonwloadPending',
                    },
                    { upsert: true, new: true }
                )
            } else {
                this.continue = false
                await this.setErrorStatus('Não foi possível obter a URL ou o nome do arquivo para download.')
            }
        } catch (error) {
            await this.setErrorStatus(`Erro ao adicionar à fila de download: ${error}`)

            await this.page.close()
            await this.browser.close()
        }
    }

    private async setErrorStatus(warn: string): Promise<void> {
        logger.error(warn)

        const screenshotPath = await this.createFolderToSaveData()
        const screenshot = await this.screenshot(screenshotPath)

        await Note.findOneAndUpdate(
            {
                company: this.note.company,
                modelNote: this.note.modelNote,
                typeNote: this.note.typeNote,
                initialPeriod: this.note.initialPeriod,
                finalPeriod: this.note.finalPeriod,
            },
            {
                statusNote: 'Error',
                warn,
                screenshot
            },
            { upsert: true, new: true }
        )
    }

    private async setWarningStatus(warn: string): Promise<void> {
        logger.warn(warn)

        const screenshotPath = await this.createFolderToSaveData()
        const screenshot = await this.screenshot(screenshotPath)

        await Note.findOneAndUpdate(
            {
                company: this.note.company,
                modelNote: this.note.modelNote,
                typeNote: this.note.typeNote,
                initialPeriod: this.note.initialPeriod,
                finalPeriod: this.note.finalPeriod,
            },
            {
                statusNote: 'Warning',
                screenshot,
                warn
            }, { upsert: true, new: true }
        )
    }

    async pageGoto(): Promise<void> {
        await this.page.goto('https://portal.sefaz.go.gov.br/portalsefaz-apps/auth/login-form/', {
            waitUntil: "domcontentloaded",
            timeout: 60000
        })
    }

    async login (): Promise<void> {
        try {
            
            const inputUsernameSelector = 'input[name="username"]'
            await this.page.locator(inputUsernameSelector).click()
            await this.page.fill(inputUsernameSelector, env.USER || '')

            const inputPasswordSelector= 'input[name="password"]'
            await this.page.locator(inputPasswordSelector).click()
            await this.page.fill(inputPasswordSelector, env.PASSWORD || '')
            
            await this.page.locator('button:has-text("Autenticar")').click()
            await this.page.waitForTimeout(1000)

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.setErrorStatus(`Erro ao tentar fazer login: ${message}`)
        }
    }

    async openPageAcessoRestrito() {
        const [consultationPage] = await Promise.all([
            this.page.waitForEvent('popup'),
            this.page.locator('div[role="main"] div:has-text("Acesso Restrito")').nth(4).click()
        ])

        return consultationPage
    }

    async openConsultPage() {
        if (!this.continue) return

        try {
            this.page = await this.openPageAcessoRestrito()

            await this.page.reload()
            
            // Primeiro clique em "Baixar XML NFE"
            await this.page.frameLocator('iframe[name="iNetaccess"]').locator('text=Baixar XML NFE').click()
            
            // Preenche a senha
            await this.page.frameLocator('iframe[name="iNetaccess"]').locator('[placeholder="Senha"]').click()
            await this.page.frameLocator('iframe[name="iNetaccess"]').locator('[placeholder="Senha"]').fill(env.PASSWORD || '')
            
            // Clica em "Autenticar"
            await this.page.frameLocator('iframe[name="iNetaccess"]').locator('button:has-text("Autenticar")').click()
            
            // Aguarda um pouco para a página carregar
            await this.page.waitForTimeout(2000)
            
            // Segundo clique em "Baixar XML NFE" - para chegar ao formulário
            await this.page.frameLocator('iframe[name="iNetaccess"]').locator('text=Baixar XML NFE').click()
            
            // Aguarda formulário carregar
            await this.page.waitForTimeout(3000)
            
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.setErrorStatus(`Erro ao abrir página de consulta: ${message}`)
        }
    }

    private async getIframeContent(): Promise<void> {
        try {
            const iframeSelector = 'iframe[name="iNetaccess"]'

            await this.page.waitForSelector(iframeSelector)

            const iframeElement = await this.page.$(iframeSelector)
            const frameContent = await iframeElement?.contentFrame()

            if (frameContent) {
                this.iframeContent = frameContent
            } else {
                throw new Error('Não foi possível acessar o conteúdo do iframe.')
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.setErrorStatus(`Erro ao obter conteúdo do iframe: ${message}`)
        }
    }

    private async writeFormOfConsult(): Promise<void> {
        try {
            if (!this.continue) return

            await this.getIframeContent()
            
            // Data inicial
            const inputDateInitialSelector = 'input[name="cmpDataInicial"]'
            await this.iframeContent?.waitForSelector(inputDateInitialSelector)
            await this.iframeContent?.click(inputDateInitialSelector)
            await this.iframeContent?.fill(inputDateInitialSelector, '')
            await this.iframeContent?.type(inputDateInitialSelector, this.note.initialPeriod.toLocaleDateString())

            // Data final
            const inputDateFinalSelector = 'input[name="cmpDataFinal"]'
            await this.iframeContent?.waitForSelector(inputDateFinalSelector)
            await this.iframeContent?.click(inputDateFinalSelector)
            await this.iframeContent?.fill(inputDateFinalSelector, '')
            await this.iframeContent?.type(inputDateFinalSelector, this.note.finalPeriod.toLocaleDateString())

            // Número IE
            const inputNumIESelector = 'input[name="cmpNumIeDest"]'
            await this.iframeContent?.waitForSelector(inputNumIESelector)
            await this.iframeContent?.click(inputNumIESelector)
            await this.iframeContent?.fill(inputNumIESelector, this.note.company.stateRegistration || '')

            // Tipo de Nota
            let inputCmpTipoNotaSelector = ''
            if (this.note.typeNote === 0) inputCmpTipoNotaSelector = 'input[name="cmpTipoNota"][value="0"]'
            else if (this.note.typeNote === 1) inputCmpTipoNotaSelector = 'input[name="cmpTipoNota"][value="1"]'

            if (inputCmpTipoNotaSelector) {
                await this.iframeContent?.waitForSelector(inputCmpTipoNotaSelector)
                await this.iframeContent?.click(inputCmpTipoNotaSelector)
            }

            // Modelo
            const inputModelSelector = 'select[name="cmpModelo"]'
            await this.iframeContent?.waitForSelector(inputModelSelector)
            const optionModel = this.note.modelNote === 0 ? "-" : this.note.modelNote.toString()
            await this.iframeContent?.selectOption(inputModelSelector, optionModel)

            // Canceladas
            // const inputCanceledSelector = 'input[name="cmpExbNotasCanceladas"]'
            // const inputCanceled = await this.iframeContent?.waitForSelector(inputCanceledSelector)
            // await inputCanceled?.check()
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.setErrorStatus(`Erro ao preencher formulário: ${message}`)
        }
    }

    private async thowCaptcha(): Promise<void> {
        if (!this.continue) return

        try {
            const siteKey = await this.iframeContent?.getAttribute('[data-callback="pegarTokenSuccess"]', "data-sitekey")
            logger.info(`Sitekey encontrada: ${siteKey}`)
        
            const captchaToken = "success" // Substitua por sua lógica real de obtenção do token
        
            if (!captchaToken) {
                logger.error("Não foi possível resolver o captcha!")
                return
            }
        
            await this.page.waitForTimeout(10000)
        
            // Injetar resposta no campo hidden
            await this.iframeContent?.evaluate((token: string) => {
                const input = document.getElementById('g-recaptcha-response') as HTMLInputElement // Corrigido o seletor
                console.log("input: ", input)
                if (input) {
                    input.value = token
                }
            }, captchaToken) // captchaToken agora é o segundo argumento de page.evaluate
    
        
            logger.info("Token injetado no formulário!")
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await this.setErrorStatus(`Erro ao resolver o captcha: ${message}`)
        }

    }

    private async search() {
        if (!this.continue) return

        await this.getIframeContent()

        try {
            await this.iframeContent?.click('button#btnPesquisar')
        } catch (error) {
            logger.error(`Erro ao realizar a pesquisa: ${error}`)

            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    typeNote: this.note.typeNote,
                    modelNote: this.note.modelNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Error',
                    warn: 'Não foi possível carregar o resultado da pesquisa.',
                },
                { upsert: true, new: true }
            )

            await this.page.close()
            await this.browser.close()
        }
    }

    private async checkIfNotResult(): Promise<void> {
        try {
            if (!this.continue) return

            const notResult = await this.iframeContent?.getByText('×FecharSem Resultados!').isVisible()

            if (notResult) {
                this.continue = false
                await this.setWarningStatus('Sem resultados.')
            }
        } catch (error) {
            await this.setErrorStatus(`Erro ao verificar resultados: ${(error instanceof Error ? error.message : String(error))}`)
        }
    }

    private async checkIfHavePermission(): Promise<void> {
        try {
            if (!this.continue) return

            const noResultAlert = await this.iframeContent?.getByText('Você não tem permissão para acessar esta página.').isVisible()

            if (noResultAlert) {
                this.continue = false

                await this.setErrorStatus('Sem permissão.')

                await this.page.close()
                await this.browser.close()
            }
        } catch (error) {
            await this.setErrorStatus(`Erro ao verificar resultados: ${(error instanceof Error ? error.message : String(error))}`)
        }
    }

    async setDownloadLink(): Promise<void> {
        try {
            await Note.findOneAndUpdate(
                {
                    modelNote: this.note.modelNote,
                    typeNote: this.note.typeNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Processing',
                },
                { upsert: true, new: true }
            )

            this.browser = await chromium.launch({ headless: false, slowMo: 500 })
            this.context = await this.browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
            this.page = await this.context.newPage()
            
            await this.pageGoto()
            await this.login()
            await this.openConsultPage()
            await this.writeFormOfConsult()
            await this.thowCaptcha()
            await this.search()
            await this.checkIfNotResult()
            await this.checkIfHavePermission()
            await this.addToDownloadQueue()
        } catch (error) {
            // Um catch genérico para capturar erros inesperados (como o timeout do page.goto)
            logger.error(`Erro inesperado no processo getDownloadLink: ${error}`)
            
            await this.setErrorStatus(`Falha crítica no site do sefaz: ${error}`)
        } finally {
            logger.info("Finalizando processo getDownloadLink e fechando o navegador.")

            if (this.page && !this.page.isClosed()) {
                await this.page.close()
            }

            if (this.browser && this.browser.isConnected()) {
                await this.browser.close()
            }
        }
    }

    private async conferenceScreenshot(): Promise<string> {
        await this.page.keyboard.press('End')
        const screenshotPath = await this.createFolderToSaveData()
        const screenshot = await this.screenshot(screenshotPath)
        return screenshot
    }

    async downloadFile() {
        try {
            this.browser = await chromium.launch({ headless: false, slowMo: 500, })
            this.context = await this.browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
            this.page = await this.context.newPage()

            await this.pageGoto()
            await this.login()
            await this.openConsultPage()
            
            if (!this.note.linkDownload) {
                logger.info('Link de download não disponível.')
                return
            }

            logger.info(this.note.linkDownload)

            await this.page.goto(this.note.linkDownload, { waitUntil: 'domcontentloaded', timeout: 60000 })

            await this.page.waitForSelector('table.tablesorter tbody tr')

            let line

            if (this.note.fileName) {
                line = this.page.locator(`table.tablesorter tbody tr:has(td.col-arquivo:has-text("${this.note.fileName}"))`)
                if (await line.count() === 0) {
                    logger.info(`Arquivo "${this.note.fileName}" não encontrado na tabela.`)
                    return null
                }
            } else {
                line = this.page.locator('table.tablesorter tbody tr').first()
            }

            const linkDownload = await line.locator('.col-acoes a.btn-info').getAttribute('href')

            if (!linkDownload) {
                logger.info(`Arquivo ${this.note.fileName || '(primeira linha)'} encontrado, mas sem link de download.`)
                return null
            }

            const [download] = await Promise.all([
                this.page.waitForEvent('download'),
                line.locator('.col-acoes a.btn-info').click()
            ])

            const pathRelativeNote = await this.createFolderToSaveData()
            const filename = download.suggestedFilename() || ''
            const pathRelativeAbsolute = path.resolve(path.join(pathRelativeNote, filename))

            await download.saveAs(pathRelativeAbsolute)

            if (fs.existsSync(pathRelativeAbsolute)) {
                const conferenceScreenshotPath = await this.conferenceScreenshot()

                logger.info(conferenceScreenshotPath)
                logger.info('Download realizado com sucesso.')

                await Note.findOneAndUpdate({
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    typeNote: this.note.typeNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                }, {
                    screenshot: conferenceScreenshotPath,
                    filePath: pathRelativeAbsolute,
                    statusNote: 'Success',
                }, { upsert: true, new: true })
            }

            logger.info(pathRelativeAbsolute)

        } catch (error) {
            logger.error(`Erro inesperado no processo downloadFile: ${error}`)
        } finally {
            logger.info("Finalizando processo downloadFile e fechando o navegador.")
            if (this.page && !this.page.isClosed()) {
                await this.page.close()
            }
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close()
            }
        }
    }
}
