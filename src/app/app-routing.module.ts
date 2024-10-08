import { Routes } from '@angular/router';
import { AboutPage } from './pages/about/about.page';
import { MainPage } from './pages/main/main.page';
import { SettingsPage } from './pages/settings/settings.page';

export enum AppRoutesEnum {
  Main = 'main',
  Settings = 'settings',
  About = 'about',
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: AppRoutesEnum.Main },
  { path: AppRoutesEnum.Main,     component: MainPage },
  { path: AppRoutesEnum.Settings, component: SettingsPage },
  { path: AppRoutesEnum.About,    component: AboutPage },
];
