import { BASE_PATH, IS_SAAS } from 'lib/constants'

export const HOOK_EVENTS = [
  {
    label: 'Insert',
    value: 'INSERT',
    description: 'Any insert operation on the table',
  },
  {
    label: 'Update',
    value: 'UPDATE',
    description: 'Any update operation, of any column in the table',
  },
  {
    label: 'Delete',
    value: 'DELETE',
    description: 'Any deletion of a record',
  },
]

export const AVAILABLE_WEBHOOK_TYPES = [
  {
    value: 'http_request',
    icon: `${BASE_PATH}/img/function-providers/http-request.png`,
    label: 'HTTP Request',
    description: 'Send an HTTP request to any URL.',
  },
  ...(IS_SAAS
    ? [
        {
          value: 'supabase_function',
          icon: `${BASE_PATH}/img/function-providers/supabase-severless-function.png`,
          label: 'Indobase Edge Functions',
          description: 'Choose a Indobase edge function to run.',
        },
      ]
    : []),
]
