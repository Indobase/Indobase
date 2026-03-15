import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: '.env.local',
      language: 'bash',
      code: [
        `INDOBASE_URL=${projectKeys.apiUrl ?? 'your-project-url'}`,
        `INDOBASE_KEY=${projectKeys.publishableKey ?? projectKeys.anonKey ?? 'your-anon-key'}`,
        '',
      ].join('\n'),
    },
    {
      name: 'nuxt.config.ts',
      language: 'ts',
      code: `
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      indobaseUrl: process.env.INDOBASE_URL,
      indobaseKey: process.env.INDOBASE_KEY,
    },
  },
})
`,
    },
    {
      name: 'app.vue',
      language: 'html',
      code: `
<script setup>
import { ref, onMounted } from 'vue'
import { createClient } from 'indobase-js'

const config = useRuntimeConfig()
const indobase = createClient(config.public.indobaseUrl, config.public.indobaseKey)

const todos = ref([])

async function getTodos() {
  const { data } = await indobase.from('todos').select()
  todos.value = data
}

onMounted(() => {
  getTodos()
})
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.name }}</li>
  </ul>
</template>
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
