import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../core/services/task.service';
import { AuthService } from '../../core/auth/auth.service';
import { Task } from '../../core/models/task.models';
import { PagedResult } from '../../core/models/api.models';

interface ProgressForm {
  status:               number;   // numeric enum  1-4
  completionPercentage: number;
}

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tasks.component.html',
  styleUrl:    './tasks.component.scss'
})
export class TasksComponent implements OnInit {

  // ── list state ────────────────────────────────────────────────────────────
  result         = signal<PagedResult<Task> | null>(null);
  loading        = signal(true);
  page           = 1;
  search         = '';
  statusFilter   = '';
  priorityFilter = '';

  // ── update-progress modal ─────────────────────────────────────────────────
  showProgress   = signal(false);
  progSubmitting = signal(false);
  progError      = signal<string | null>(null);
  progSuccess    = signal<string | null>(null);
  selectedTask   = signal<Task | null>(null);
  progForm: ProgressForm = { status: 1, completionPercentage: 0 };

  readonly taskStatuses = [
    { value: 1, label: 'To Do'       },
    { value: 2, label: 'In Progress' },
    { value: 3, label: 'In Review'   },
    { value: 4, label: 'Completed'   }
  ];

  private authService = inject(AuthService);
  private taskService = inject(TaskService);

  // ── computed flags ────────────────────────────────────────────────────────
  private get currentUserId(): number | undefined {
    return this.authService.currentUser()?.id;
  }

  /** True if the user can see tasks beyond just their own */
  private get isAdminOrPM(): boolean {
    const roles = this.authService.currentUser()?.roles ?? [];
    return roles.includes('OrganizationAdmin') || roles.includes('ProjectManager');
  }

  /** Which tasks to filter to by assignedUserId (undefined = see all) */
  private get assignedUserFilter(): number | undefined {
    return this.isAdminOrPM ? undefined : this.currentUserId;
  }

  /** Only the user assigned to the task can update its progress */
  canUpdate(task: Task): boolean {
    return task.assignedToUserId === this.currentUserId;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void { this.load(); }

  // ── list ──────────────────────────────────────────────────────────────────
  load(): void {
    this.loading.set(true);
    this.taskService.getAll({
      page:             this.page,
      search:           this.search          || undefined,
      status:           this.statusFilter    || undefined,
      priority:         this.priorityFilter  || undefined,
      assignedToUserId: this.assignedUserFilter
    }).subscribe({
      next: data => { this.result.set(data); this.loading.set(false); },
      error: ()  => this.loading.set(false)
    });
  }

  onSearch(): void { this.page = 1; this.load(); }
  changePage(p: number): void { this.page = p; this.load(); }

  // ── update-progress modal ─────────────────────────────────────────────────
  openProgress(task: Task): void {
    this.selectedTask.set(task);
    this.progForm = {
      status:               Number(task.status) || 1,
      completionPercentage: task.completionPercentage
    };
    this.progError.set(null);
    this.progSuccess.set(null);
    this.showProgress.set(true);
  }

  closeProgress(): void {
    if (!this.progSubmitting()) this.showProgress.set(false);
  }

  submitProgress(): void {
    const task = this.selectedTask();
    if (!task) return;
    this.progError.set(null);

    const pct = Number(this.progForm.completionPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      this.progError.set('Progress must be between 0 and 100.'); return;
    }

    this.progSubmitting.set(true);

    // Send all existing fields back — only status and completionPercentage change
    this.taskService.update(task.id, {
      title:                task.title,
      description:          task.description,
      assignedToUserId:     task.assignedToUserId,
      priority:             task.priority as any,
      status:               this.progForm.status as any,
      dueDate:              task.dueDate,
      completionPercentage: pct
    }).subscribe({
      next: updated => {
        // Patch the task in place so the list refreshes without a full reload
        this.result.update(r => {
          if (!r) return r;
          return {
            ...r,
            items: r.items.map(t => t.id === updated.id ? updated : t)
          };
        });
        this.progSubmitting.set(false);
        this.progSuccess.set('Progress updated successfully.');
        setTimeout(() => this.showProgress.set(false), 1200);
      },
      error: err => {
        this.progSubmitting.set(false);
        this.progError.set(err.error?.error ?? 'Failed to update task.');
      }
    });
  }

  // ── display helpers ───────────────────────────────────────────────────────
  priorityLabel(p: string | number): string {
    const map: Record<string, string> = {
      '1': 'Low', '2': 'Medium', '3': 'High', '4': 'Urgent',
      Low: 'Low', Medium: 'Medium', High: 'High', Urgent: 'Urgent'
    };
    return map[String(p)] ?? String(p);
  }

  priorityClass(p: string | number): string {
    const map: Record<string, string> = {
      '1': 'priority-low',    Low:    'priority-low',
      '2': 'priority-medium', Medium: 'priority-medium',
      '3': 'priority-high',   High:   'priority-high',
      '4': 'priority-urgent', Urgent: 'priority-urgent'
    };
    return map[String(p)] ?? 'priority-medium';
  }

  statusLabel(s: string | number): string {
    const map: Record<string, string> = {
      '1': 'To Do', '2': 'In Progress', '3': 'In Review', '4': 'Completed',
      Todo: 'To Do', InProgress: 'In Progress', InReview: 'In Review', Completed: 'Completed'
    };
    return map[String(s)] ?? String(s);
  }

  statusClass(s: string | number): string {
    const map: Record<string, string> = {
      '1': 'badge-gray',    Todo:       'badge-gray',
      '2': 'badge-primary', InProgress: 'badge-primary',
      '3': 'badge-warning', InReview:   'badge-warning',
      '4': 'badge-success', Completed:  'badge-success'
    };
    return map[String(s)] ?? 'badge-gray';
  }

  isOverdue(task: Task): boolean {
    const completed = String(task.status) === '4' || task.status === 'Completed';
    return !!task.dueDate && !completed && new Date(task.dueDate) < new Date();
  }
}
