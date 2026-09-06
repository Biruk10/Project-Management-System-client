import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { AuthService } from '../../core/auth/auth.service';
import { DashboardSummary } from '../../core/models/dashboard.models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  data    = signal<DashboardSummary | null>(null);
  loading = signal(true);

  private authService = inject(AuthService);

  readonly isOrgAdmin = (this.authService.currentUser()?.roles.includes('OrganizationAdmin')) ?? false;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.dashboardService.getSummary().subscribe({
      next: d  => { this.data.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  statusBadge(status: string | number): string {
    const map: Record<string, string> = {
      '0': 'badge badge-gray',    NotStarted: 'badge badge-gray',
      '1': 'badge badge-primary', InProgress: 'badge badge-primary',
      '2': 'badge badge-success', Completed:  'badge badge-success',
      '3': 'badge badge-warning', OnHold:     'badge badge-warning',
      '4': 'badge badge-danger',  Cancelled:  'badge badge-danger'
    };
    return map[String(status)] ?? 'badge badge-gray';
  }

  statusLabel(status: string | number): string {
    const map: Record<string, string> = {
      '0': 'Not Started', '1': 'In Progress', '2': 'Completed',
      '3': 'On Hold',     '4': 'Cancelled',
      NotStarted: 'Not Started', InProgress: 'In Progress',
      Completed:  'Completed',   OnHold: 'On Hold', Cancelled: 'Cancelled'
    };
    return map[String(status)] ?? String(status);
  }
}
