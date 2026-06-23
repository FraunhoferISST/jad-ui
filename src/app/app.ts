import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Application root. Hosts the top-level router outlet so that the login view
 * (outside the dashboard shell) and the authenticated shell layout can be
 * rendered as sibling routes.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}
