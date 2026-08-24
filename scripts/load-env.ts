// Side-effect module: must be the FIRST import in every script so .env.local
// is loaded before app modules read process.env at module scope (ES imports
// are hoisted; an inline config() call after an import list runs too late).
import { config } from 'dotenv'

config({ path: '.env.local' })
