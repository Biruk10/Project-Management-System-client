import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProjectService } from '../../../core/services/project.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Project } from '../../../core/models/project.models';
import { User } from '../../../core/models/user.models';
import { PagedResult } from '../../../core/models/api.models';

interface NewProjectForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  projectManagerId: number | null;
}

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss'
})
export class ProjectsListComponent implements OnInit {
  result  = signal<PagedResult<Project> | null>(null);
  loading = signal(true);
  page    = 1;
  search  = '';
  statusFilter = '';

  // modal
  showModal  = signal(false);
  submitting = signal(false);
  formError  = signal<string | null>(null);
  users      = signal<User[]>([]);
  form: NewProjectForm = this.emptyForm();

  /** true when the logged-in user is a ProjectManager (not OrgAdmin) */
  readonly isProjectManager: boolean;
  /** the current user's id — used to scope PM's own projects */
  private readonly currentUserId: number | null;

  constructor(
    private projectService: ProjectService,
    private userService: UserService,
    private authService: AuthService
  ) {
    const u = this.authService.currentUser();
    this.currentUserId  = u?.id ?? null;
    // has ProjectManager role but NOT OrganizationAdmin
    this.isProjectManager =
      (u?.roles.includes('ProjectManager') ?? false) &&
      !(u?.roles.includes('OrganizationAdmin') ?? false);
  }

  ngOnInit(): void {
    this.load();
    // only admins need the PM dropdown when creating a project
    if (!this.isProjectManager) this.loadUsers();
  }

  load(): void {
    this.loading.set(true);

    // PMs only see their own projects; admins see all
    const pmFilter = this.isProjectManager && this.currentUserId
      ? this.currentUserId
      : undefined;

    this.projectService.getAll({
      page:             this.page,
      search:           this.search || undefined,
      status:           this.statusFilter || undefined,
      projectManagerId: pmFilter
    }).subscribe({
      next: d  => { this.result.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadUsers(): void {
    this.userService.getAll({ pageSize: 100 }).subscribe({
      next: r => this.users.set(r.items)
    });
  }

  onSearch(): void  { this.page = 1; this.load(); }
  changePage(p: number): void { this.page = p; this.load(); }

  // ── modal ─────────────────────────────────────────────────────────────────

  openModal(): void {
    this.form = this.emptyForm();
    this.formError.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.submitting()) return;
    this.showModal.set(false);
  }

  submitCreate(): void {
    this.formError.set(null);
    if (!this.form.name.trim()) {
      this.formError.set('Project name is required.'); return;
    }
    if (!this.form.startDate) {
      this.formError.set('Start date is required.'); return;
    }

    this.submitting.set(true);
    this.projectService.create({
      name:             this.form.name.trim(),
      description:      this.form.description.trim() || undefined,
      startDate:        this.form.startDate,
      endDate:          this.form.endDate || undefined,
      projectManagerId: this.form.projectManagerId ?? undefined
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showModal.set(false);
        this.load();
      },
      error: err => {
        this.submitting.set(false);
        this.formError.set(err.error?.error ?? 'Failed to create project. Please try again.');
      }
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  statusClass(status: string | number): string {
    const map: Record<string, string> = {
      '0': 'badge-gray',    NotStarted: 'badge-gray',
      '1': 'badge-primary', InProgress: 'badge-primary',
      '2': 'badge-success', Completed:  'badge-success',
      '3': 'badge-warning', OnHold:     'badge-warning',
      '4': 'badge-danger',  Cancelled:  'badge-danger'
    };
    return map[String(status)] ?? 'badge-gray';
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

  private emptyForm(): NewProjectForm {
    return { name: '', description: '', startDate: '', endDate: '', projectManagerId: null };
  }
}
