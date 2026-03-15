import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env',
      language: 'bash',
      code: `
INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}
INDOBASE_KEY=${projectKeys.publishableKey ?? projectKeys.anonKey ?? 'your-anon-key'}
        `,
    },
    {
      name: 'app.py',
      language: 'python',
      code: `
import os
from flask import Flask
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

indobase: Client = create_client(
    os.environ.get("INDOBASE_URL"),
    os.environ.get("INDOBASE_KEY")
)

@app.route('/')
def index():
    response = indobase.table('todos').select("*").execute()
    todos = response.data

    html = '<h1>Todos</h1><ul>'
    for todo in todos:
        html += f'<li>{todo["name"]}</li>'
    html += '</ul>'

    return html

if __name__ == '__main__':
    app.run(debug=True)
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
