import { Component, signal, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DashboardAppComponent, EdcConfig, AppConfig } from '@eclipse-edc/dashboard-core';
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DashboardAppComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('lib-test');

  private readonly http = inject(HttpClient);

  protected readonly themes = [
    'light',
    'dark',
    'dim',
    'aqua',
    'nord',
    'synthwave',
    'forest',
    'dracula',
    'night',
    'coffee',
    'emerald',
  ];
  edcConfigs?: Promise<EdcConfig[]>;
  appConfig?: Promise<AppConfig>;

  ngOnInit() {
    this.edcConfigs = firstValueFrom(this.http.get<EdcConfig[]>('config/edc-connector-config.json'));
    this.appConfig = firstValueFrom(this.http.get<AppConfig>('config/app-config.json'));
  }
}
