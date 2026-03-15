import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: 'Indobase.swift',
      language: 'swift',
      code: `
import Foundation
import Indobase

let indobase = IndobaseClient(
  indobaseURL: URL(string: "${projectKeys.apiUrl ?? 'your-project-url'}")!,
  indobaseKey: "${projectKeys.publishableKey ?? '<prefer publishable key for native apps instead of anon key>'}"
)
        `,
    },
    {
      name: 'Todo.swift',
      language: 'swift',
      code: `
import Foundation

struct Todo: Identifiable, Decodable {
  var id: Int
  var name: String
}
`,
    },
    {
      name: 'ContentView.swift',
      language: 'swift',
      code: `
import Indobase
import SwiftUI

struct ContentView: View {
  @State var todos: [Todo] = []

  var body: some View {
    NavigationStack {
      List(todos) { todo in
        Text(todo.name)
      }
      .navigationTitle("Todos")
      .task {
        do {
          todos = try await indobase.from("todos").select().execute().value
        } catch {
          debugPrint(error)
        }
      }
    }
  }
}

#Preview {
  ContentView()
}

`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
