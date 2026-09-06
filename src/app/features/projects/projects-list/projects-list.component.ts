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
  initialBudget: number | null;
  budgetCategory: string;
}

interface EditProjectForm {
  id: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  projectManagerId: number | null;
  status: number;
  progressPercentage: number;
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

  // New project modal
  showModal  = signal(false);
  submitting = signal(false);
  formError  = signal<string | null>(null);
  users      = signal<User[]>([]);
  form: NewProjectForm = this.emptyForm();

  // Edit project modal
  showEditModal  = signal(false);
  editSubmitting = signal(false);
  editError      = signal<string | null>(null);
  editForm: EditProjectForm = this.emptyEditForm();

  // Cancel project confirm modal
  showCancelModal  = signal(false);
  cancellingProject = signal<Project | null>(null);
  cancelSubmitting = signal(false);
  cancelError      = signal<string | null>(null);

  // Delete project confirm modal
  showDeleteModal  = signal(false);
  deletingProject  = signal<Project | null>(null);
  deleteSubmitting = signal(false);
  deleteError      = signal<string | null>(null);

  /** true when the logged-in user is a ProjectManager (not OrgAdmin) */
  readonly isProjectManager: boolean;
  readonly isOrgAdmin: boolean;
  /** the current user's id — used to scope PM's own projects */
  private readonly currentUserId: number | null;

  readonly projectStatuses = [
    { value: 0, label: 'Not Started' },
    { value: 1, label: 'In Progress' },
    { value: 2, label: 'Completed'   },
    { value: 3, label: 'On Hold'     },
    { value: 4, label: 'Cancelled'   }
  ];

  constructor(
    private projectService: ProjectService,
    private userService: UserService,
    private authService: AuthService
  ) {
    const u = this.authService.currentUser();
    this.currentUserId  = u?.id ?? null;
    this.isOrgAdmin = u?.roles.includes('OrganizationAdmin') ?? false;
    this.isProjectManager =
      (u?.roles.includes('ProjectManager') ?? false) && !this.isOrgAdmin;
  }

  ngOnInit(): void {
    this.load();
    if (!this.isProjectManager) this.loadUsers();
  }

  load(): void {
    this.loading.set(true);

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

  // ── New Project Modal ─────────────────────────────────────────────────────

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
    if (!this.isProjectManager) {
      if (!this.form.initialBudget || this.form.initialBudget <= 0) {
        this.formError.set('Budget amount is required and must be greater than 0.'); return;
      }
    }

    this.submitting.set(true);
    this.projectService.create({
      name:             this.form.name.trim(),
      description:      this.form.description.trim() || undefined,
      startDate:        this.form.startDate,
      endDate:          this.form.endDate || undefined,
      projectManagerId: this.form.projectManagerId ?? undefined,
      initialBudget:    this.form.initialBudget ?? undefined,
      budgetCategory:   this.form.budgetCategory?.trim() || 'General'
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

  // ── Edit Project Modal ────────────────────────────────────────────────────

  openEdit(p: Project): void {
    if (this.users().length === 0) this.loadUsers();
    const statusNum = Number(p.status);
    this.editForm = {
      id:                 p.id,
      name:               p.name,
      description:        p.description ?? '',
      startDate:          p.startDate ? p.startDate.substring(0, 10) : '',
      endDate:            p.endDate ? p.endDate.substring(0, 10) : '',
      projectManagerId:   p.projectManagerId ?? null,
      status:             isNaN(statusNum) ? 1 : statusNum,
      progressPercentage: p.progressPercentage
    };
    this.editError.set(null);
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    if (!this.editSubmitting()) this.showEditModal.set(false);
  }

  submitEdit(): void {
    this.editError.set(null);
    if (!this.editForm.name.trim()) {
      this.editError.set('Project name is required.'); return;
    }
    if (!this.editForm.startDate) {
      this.editError.set('Start date is required.'); return;
    }

    const pct = Number(this.editForm.progressPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      this.editError.set('Progress must be between 0 and 100.'); return;
    }

    this.editSubmitting.set(true);
    this.projectService.update(this.editForm.id, {
      name:               this.editForm.name.trim(),
      description:        this.editForm.description.trim() || undefined,
      startDate:          this.editForm.startDate,
      endDate:            this.editForm.endDate || undefined,
      status:             this.editForm.status as any,
      progressPercentage: pct,
      projectManagerId:   this.editForm.projectManagerId ?? undefined
    }).subscribe({
      next: () => {
        this.editSubmitting.set(false);
        this.showEditModal.set(false);
        this.load();
      },
      error: err => {
        this.editSubmitting.set(false);
        this.editError.set(err.error?.error ?? 'Failed to update project.');
      }
    });
  }

  // ── Cancel Project Confirmation ───────────────────────────────────────────

  openCancel(p: Project): void {
    this.cancellingProject.set(p);
    this.cancelError.set(null);
    this.showCancelModal.set(true);
  }

  closeCancelModal(): void {
    if (!this.cancelSubmitting()) this.showCancelModal.set(false);
  }

  confirmCancel(): void {
    const p = this.cancellingProject();
    if (!p) return;
    this.cancelSubmitting.set(true);
    this.cancelError.set(null);

    this.projectService.update(p.id, {
      name:               p.name,
      description:        p.description || undefined,
      startDate:          p.startDate,
      endDate:            p.endDate || undefined,
      status:             4 as any, // Cancelled
      progressPercentage: p.progressPercentage,
      projectManagerId:   p.projectManagerId ?? undefined
    }).subscribe({
      next: () => {
        this.cancelSubmitting.set(false);
        this.showCancelModal.set(false);
        this.load();
      },
      error: err => {
        this.cancelSubmitting.set(false);
        this.cancelError.set(err.error?.error ?? 'Failed to cancel project.');
      }
    });
  }

  // ── Delete Project Confirmation ───────────────────────────────────────────

  openDelete(p: Project): void {
    this.deletingProject.set(p);
    this.deleteError.set(null);
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    if (!this.deleteSubmitting()) this.showDeleteModal.set(false);
  }

  confirmDelete(): void {
    const p = this.deletingProject();
    if (!p) return;
    this.deleteSubmitting.set(true);
    this.deleteError.set(null);

    this.projectService.delete(p.id).subscribe({
      next: () => {
        this.deleteSubmitting.set(false);
        this.showDeleteModal.set(false);
        this.load();
      },
      error: err => {
        this.deleteSubmitting.set(false);
        this.deleteError.set(err.error?.error ?? 'Failed to delete project.');
      }
    });
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  isCancelled(p: Project): boolean {
    return String(p.status) === '4' || p.status === 'Cancelled';
  }

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
    return {
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      projectManagerId: null,
      initialBudget: null,
      budgetCategory: 'General'
    };
  }

  private emptyEditForm(): EditProjectForm {
    return {
      id: 0,
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      projectManagerId: null,
      status: 1,
      progressPercentage: 0
    };
  }
}
