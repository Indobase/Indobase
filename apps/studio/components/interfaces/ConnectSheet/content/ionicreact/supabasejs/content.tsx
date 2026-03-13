import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env',
      language: 'bash',
      code: `
REACT_APP_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}
REACT_APP_INDOBASE_KEY=${projectKeys.publishableKey ?? '<prefer publishable key instead of anon key for mobile or desktop apps>'}
        `,
    },
    {
      name: 'src/indobaseClient.tsx',
      language: 'ts',
      code: `
import { createClient } from 'indobase-js'

const indobaseUrl = process.env.REACT_APP_INDOBASE_URL
const indobaseAnonKey = process.env.REACT_APP_INDOBASE_KEY

export const indobase = createClient(indobaseUrl, indobaseAnonKey)
`,
    },
    {
      name: 'src/App.tsx',
      language: 'ts',
      code: `
import React, { useEffect, useState } from 'react';
import { setupIonicReact, IonApp } from '@ionic/react';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonList,
  IonItem,
} from '@ionic/react';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Theme variables */
import './theme/variables.css';

import { indobase } from './indobaseClient';

setupIonicReact();

export default function App() {
  const [todos, setTodos] = useState([]);
  useEffect(() => {
    getTodos();
  }, []);

  const getTodos = async () => {
    try {
      const { data, error } = await indobase.from('todos').select();

      if (error) {
        console.error('Error fetching todos:', error.message);
        return;
      }

      if (data) {
        setTodos(data);
      }
    } catch (error) {
      console.error('Error fetching todos:', error.message);
    }
  };

  return (
    <IonApp>
      <>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Todos</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList>
            {todos.map((todo) => (
              <IonItem key={todo.id}>{todo.name}</IonItem>
            ))}
          </IonList>
        </IonContent>
      </>
    </IonApp>
  );
}
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
