import { EdgeFunction } from 'data/edge-functions/edge-function-query'

export const generateCLICommands = ({
  selectedFunction,
  functionUrl,
  anonKey,
}: {
  selectedFunction?: EdgeFunction
  functionUrl: string
  anonKey: string
}) => {
  const managementCommands: any = [
    {
      command: `indobase functions deploy ${selectedFunction?.slug}`,
      description: 'This will overwrite the deployed function with your new function',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">indobase</span> functions deploy{' '}
            {selectedFunction?.slug}
          </>
        )
      },
      comment: 'Deploy a new version',
    },
    {
      command: `indobase functions delete ${selectedFunction?.slug}`,
      description: 'This will remove the function and all the logs associated with it',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">indobase</span> functions delete{' '}
            {selectedFunction?.slug}
          </>
        )
      },
      comment: 'Delete the function',
    },
  ]

  const secretCommands: any = [
    {
      command: `indobase secrets list`,
      description: 'This will list all the secrets for your project',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">indobase</span> secrets list
          </>
        )
      },
      comment: 'View all secrets',
    },
    {
      command: `indobase secrets set NAME1=VALUE1 NAME2=VALUE2`,
      description: 'This will set secrets for your project',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">indobase</span> secrets set NAME1=VALUE1 NAME2=VALUE2
          </>
        )
      },
      comment: 'Set secrets for your project',
    },
    {
      command: `indobase secrets unset NAME1 NAME2 `,
      description: 'This will delete secrets for your project',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">indobase</span> secrets unset NAME1 NAME2
          </>
        )
      },
      comment: 'Unset secrets for your project',
    },
  ]

  const invokeCommands: any = [
    {
      command: `curl -L -X POST '${functionUrl}' -H 'Authorization: Bearer ${
        anonKey ?? '[YOUR ANON KEY]'
      }' --data '{"name":"Functions"}'`,
      description: 'Invokes the hello function',
      jsx: () => {
        return (
          <>
            <span className="text-brand-600">curl</span> -L -X POST '{functionUrl}'{' '}
            {selectedFunction?.verify_jwt
              ? `-H
            'Authorization: Bearer [YOUR ANON KEY]' `
              : ''}
            {`--data '{"name":"Functions"}'`}
          </>
        )
      },
      comment: 'Invoke your function',
    },
  ]

  return { managementCommands, secretCommands, invokeCommands }
}
