import dotenv from 'dotenv'
import { resolve, join } from 'path'

dotenv.config({ path: resolve(join(__dirname, '../..', '.env')) })

export default process.env
