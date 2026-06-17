import type { HttpRequest, IndobaseJsQuery, Statement } from '@indobaseinc/sql-to-rest'

export type BaseResult = {
  statement: Statement
}

export type HttpResult = BaseResult &
  HttpRequest & {
    type: 'http'
    language: 'http' | 'curl'
  }

export type IndobaseJsResult = BaseResult &
  IndobaseJsQuery & {
    type: 'indobase-js'
    language: 'js'
  }

/** @deprecated Use IndobaseJsResult */
export type SupabaseJsResult = IndobaseJsResult

export type ResultBundle = HttpResult | IndobaseJsResult
