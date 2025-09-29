import mongoose, { Document, Schema, createConnection } from 'mongoose'

const connection = createConnection('mongodb://192.168.255.239:27017/SomaServices')

export interface IEmpresa extends Document {
    codigo: string
    razao_social: string
    nome: string
    cnpj: string
    ende_emp: string
    bairro_emp: string
    numero_emp: string
    complemento: string
    cnae: string
    cnae_cod: string
    cnae_secudarios: string
    email: string
    ie: string
    im: string
    regime_cod: string
    inicio: Date
    saida: Date
    uf: string
    mun: string
    situacao: string
    simples: string
    fone: string
    obs: string
    regime_folha: string
    opt_simples_folha: string
    vigencia: object
    tins: number
    cep: string
    curva: string
    grupo_empresa: string
    resp_contabil: {
        first_name: string
        last_name: string
        registration_id: string
    }
    resp_fiscal: {
        first_name: string
        last_name: string
        registration_id: string
    }
    resp_folha: {
        first_name: string
        last_name: string
        registration_id: string
    }
    grupo: string
    grupo_cod: string
    folha: string
    equipe_geral: string
    equipe_dp: string
    fly: boolean
    bigcompanies: boolean
    apelido: string
}

const EmpresaSchema: Schema = new Schema(
    {
        codigo: Number,
        razao_social: String,
        nome: String,
        cnpj: String,
        ende_emp: String,
        bairro_emp: String,
        numero_emp: String,
        complemento: String,
        cnae: String,
        cnae_cod: String,
        cnae_secudarios: String,
        email: String,
        ie: String,
        im: String,
        regime_cod: String,
        inicio: Date,
        saida: Date,
        uf: String,
        mun: String,
        situacao: String,
        simples: String,
        fone: String,
        obs: String,
        regime_folha: String,
        opt_simples_folha: String,
        vigencia: Object,
        tins: Number,
        cep: String,
        curva: String,
        grupo_empresa: String,
        resp_contabil: {
            first_name: String,
            last_name: String,
            registration_id: String
        },
        resp_fiscal: {
            first_name: String,
            last_name: String,
            registration_id: String
        },
        resp_folha: {
            first_name: String,
            last_name: String,
            registration_id: String
        },
        grupo: String,
        grupo_cod: String,
        folha: String,
        equipe_geral: String,
        equipe_dp: String,
        fly: Boolean,
        bigcompanies: Boolean,
        apelido: String
    },
    { timestamps: true }
)

export default mongoose.models.Empresa || connection.model<IEmpresa>('Empresa', EmpresaSchema)
