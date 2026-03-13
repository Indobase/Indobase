import type { ContentFileProps } from 'components/interfaces/Connect/Connect.types'

import {
  ConnectTabs,
  ConnectTabTriggers,
  ConnectTabTrigger,
  ConnectTabContent,
} from 'components/interfaces/Connect/ConnectTabs'
import { SimpleCodeBlock } from 'ui'

const ContentFile = ({ projectKeys }: ContentFileProps) => {
  return (
    <ConnectTabs>
      <ConnectTabTriggers>
        <ConnectTabTrigger value="environments/environment.ts" />
        <ConnectTabTrigger value="src/app/indobase.service.ts" />
        <ConnectTabTrigger value="src/app/app.component.ts" />
        <ConnectTabTrigger value="src/app/app.component.html" />
        <ConnectTabTrigger value="src/app/app.module.ts" />
      </ConnectTabTriggers>

      <ConnectTabContent value="environments/environment.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
export const environment = {
  indobaseUrl: '${projectKeys.apiUrl ?? 'your-project-url'}',
  indobaseKey: '${projectKeys.publishableKey ?? '<prefer publishable key instead of anon key for mobile apps>'}',
};
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/app/indobase.service.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
import { Injectable } from '@angular/core';
import { createClient, IndobaseClient } from '@indobase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class IndobaseService {
  private indobase: IndobaseClient;
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
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/app/app.component.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
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
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/app/app.component.html">
        <SimpleCodeBlock className="html" parentClassName="min-h-72">
          {`
<ion-header>
<ion-toolbar>
  <ion-title>Todo List</ion-title>
</ion-toolbar>
</ion-header>

<ion-content>
<ion-list>
  <ion-item *ngFor="let todo of todos">
    <ion-label>{{ todo.title }}</ion-label>
  </ion-item>
</ion-list>
</ion-content>
`}
        </SimpleCodeBlock>
      </ConnectTabContent>

      <ConnectTabContent value="src/app/app.module.ts">
        <SimpleCodeBlock className="ts" parentClassName="min-h-72">
          {`
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
`}
        </SimpleCodeBlock>
      </ConnectTabContent>
    </ConnectTabs>
  )
}

export default ContentFile
