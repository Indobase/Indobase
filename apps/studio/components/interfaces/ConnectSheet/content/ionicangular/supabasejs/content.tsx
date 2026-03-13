import { MultipleCodeBlock } from 'ui-patterns/MultipleCodeBlock'

import type { StepContentProps } from '@/components/interfaces/ConnectSheet/Connect.types'

const ContentFile = ({ projectKeys }: StepContentProps) => {
  const files = [
    {
      name: 'environments/environment.ts',
      language: 'ts',
      code: `
export const environment = {
  indobaseUrl: '${projectKeys.apiUrl ?? 'your-project-url'}',
  indobaseKey: '${projectKeys.publishableKey ?? '<prefer publishable key instead of anon key for mobile apps>'}',
};
`,
    },
    {
      name: 'src/app/indobase.service.ts',
      language: 'ts',
      code: `
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from 'indobase-js';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class IndobaseService {
  private indobase: SupabaseClient;
  constructor() {
    this.indobase = createClient(
      environment.indobaseUrl,
      environment.indobaseKey
    );
  }

  getTodos() {
    return this.indobase.from('todos').select('*');
  }
}
`,
    },
    {
      name: 'src/app/app.component.ts',
      language: 'ts',
      code: `
import { Component, OnInit } from '@angular/core';
import { IndobaseService } from './indobase.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit {
  todos: any[] = [];

  constructor(private indobaseService: IndobaseService) {}

  async ngOnInit() {
    await this.loadTodos();
  }

  async loadTodos() {
    const { data, error } = await this.indobaseService.getTodos();
    if (error) {
      console.error('Error fetching todos:', error);
    } else {
      this.todos = data;
    }
  }
}
`,
    },
    {
      name: 'src/app/app.component.html',
      language: 'html',
      code: `
<ion-header>
<ion-toolbar>
  <ion-title>Todo List</ion-title>
</ion-toolbar>
</ion-header>

<ion-content>
<ion-list>
  <ion-item *ngFor="let todo of todos">
    <ion-label>{{ todo.name }}</ion-label>
  </ion-item>
</ion-list>
</ion-content>
`,
    },
    {
      name: 'src/app/app.module.ts',
      language: 'ts',
      code: `
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';

import { IonicModule } from '@ionic/angular';

import { AppComponent } from './app.component';
import { IndobaseService } from './indobase.service';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    RouterModule.forRoot([]),
    IonicModule.forRoot({ mode: 'ios' }),
  ],
  declarations: [AppComponent],
  providers: [IndobaseService],
  bootstrap: [AppComponent],
})
export class AppModule {}
`,
    },
  ]

  return <MultipleCodeBlock files={files} />
}

export default ContentFile
