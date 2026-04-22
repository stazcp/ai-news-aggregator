import { envBool } from './env'

export function isProjectPaused(): boolean {
  return envBool('PROJECT_PAUSED', true)
}
