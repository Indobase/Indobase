import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: `
EXPO_PUBLIC_INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}
EXPO_PUBLIC_INDOBASE_KEY=${projectKeys.publishableKey ?? '<prefer publishable key instead of anon key for mobile and desktop apps>'}
        `,
    },
    {
      name: 'utils/indobase.ts',
      language: 'ts',
      code: `
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from 'indobase-js'

export const indobase = createClient(
  process.env.EXPO_PUBLIC_INDOBASE_URL!,
  process.env.EXPO_PUBLIC_INDOBASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
        `,
    },
    {
      name: 'App.tsx',
      language: 'tsx',
      code: `
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { indobase } from '../utils/indobase';

export default function App() {
  const [todos, setTodos] = useState([]);

  useEffect(() => {
    const getTodos = async () => {
      try {
        const { data: todos, error } = await indobase.from('todos').select();

        if (error) {
          console.error('Error fetching todos:', error.message);
          return;
        }

        if (todos && todos.length > 0) {
          setTodos(todos);
        }
      } catch (error) {
        console.error('Error fetching todos:', error.message);
      }
    };

    getTodos();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Todo List</Text>
      <FlatList
        data={todos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <Text key={item.id}>{item.name}</Text>}
      />
    </View>
  );
};

`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
