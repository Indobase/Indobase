import { AuthClient } from '@indobaseinc/auth-js'
import { SupabaseAuthClientOptions } from './types'

export class SupabaseAuthClient extends AuthClient {
  constructor(options: SupabaseAuthClientOptions) {
    super(options)
  }
}
