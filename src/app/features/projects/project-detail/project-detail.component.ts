import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { TaskService } from '../../../core/services/task.service';
import { FinanceService } from '../../../core/services/finance.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Project } from '../../../core/models/project.models';
import { Task } from '../../../core/models/task.models';
import { Budget } from '../../../core/models/finance.models';
import { PagedResult } from '../../../core/models/api.models';

interface UpdateProjectForm {
  status: number;
  progressPercentage: number;
  description: string;
  endDate: string;
}

interface RecordExpenseForm {
  amount: number | null;
  description: string;
  expenseDate: string;
  budgetLineId: number | null;
}

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss'
})
export class ProjectDetailComponent implements OnInit {
  project = signal<Project | null>(null);
  tasks   = signal<PagedResult<Task> | null>(null);
  budgets = signal<Budget[]>([]);
  loading = signal(true);

  private authService     = inject(AuthService);
  private financeService  = inject(FinanceService);

  /** true for ProjectManager who is not an OrgAdmin */
  readonly canManageProject: boolean;

  // ── Update project form ───────────────────────────────────────────────────
  showUpdateForm  = signal(false);
  updateSubmit    = signal(false);
  updateError     = signal<string | null>(null);
  updateSuccess   = signal<string | null>(null);
  updateForm: UpdateProjectForm = this.emptyUpdateForm();

  // ── Record expense form ───────────────────────────────────────────────────
  showExpenseForm  = signal(false);
  expenseSubmit    = signal(false);
  expenseError     = signal<string | null>(null);
  expenseSuccess   = signal<string | null>(null);
  expenseForm: RecordExpenseForm = this.emptyExpenseForm();

  readonly projectStatuses = [
    { value: 1, label: 'In Progress' },
    { value: 2, label: 'Completed'   },
    { value: 3, label: 'On Hold'     },
    { value: 4, label: 'Cancelled'   }
  ];

  private projectId!: number;

  constructor(
    private route: ActivatedRoute,
    private projectService: ProjectService,
    private taskService: TaskService
  ) {
    const u = this.authService.currentUser();
    this.canManageProject =
      (u?.roles.includes('ProjectManager') ?? false) ||
      (u?.roles.includes('OrganizationAdmin') ?? false);
  }

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));

    this.projectService.getById(this.projectId).subscribe({
      next: p  => { this.project.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });

    this.taskService.getAll({ projectId: this.projectId, pageSize: 10 }).subscribe({
      next: t => this.tasks.set(t)
    });

    // Load budgets for the expense budget-line dropdown
    this.financeService.getBudgetsByProject(this.projectId).subscribe({
      next: b => this.budgets.set(b)
    });
  }

  // ── Update project ────────────────────────────────────────────────────────
  openUpdateForm(): void {
    const p = this.project();
    if (!p) return;
    // Convert backend status (may be int or string) to a number for the dropdown
    const statusNum = Number(p.status);
    this.updateForm = {
      status:             isNaN(statusNum) ? 1 : statusNum,
      progressPercentage: p.progressPercentage,
      description:        p.description ?? '',
      endDate:            p.endDate ? p.endDate.substring(0, 10) : ''
    };
    this.updateError.set(null);
    this.updateSuccess.set(null);
    this.showUpdateForm.set(true);
  }

  closeUpdateForm(): void { if (!this.updateSubmit()) this.showUpdateForm.set(false); }

  submitUpdate(): void {
    const p = this.project();
    if (!p) return;
    this.updateError.set(null);

    const pct = Number(this.updateForm.progressPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      this.updateError.set('Progress must be between 0 and 100.'); return;
    }

    this.updateSubmit.set(true);
    this.projectService.update(this.projectId, {
      name:               p.name,
      description:        this.updateForm.description || undefined,
      startDate:          p.startDate,
      endDate:            this.updateForm.endDate || undefined,
      status:             this.updateForm.status as any,   // numeric enum value
      progressPercentage: pct,
      projectManagerId:   p.projectManagerId ?? undefined
    }).subscribe({
      next: updated => {
        this.project.set(updated);
        this.updateSubmit.set(false);
        this.updateSuccess.set('Project updated successfully.');
        setTimeout(() => this.showUpdateForm.set(false), 1200);
      },
      error: err => {
        this.updateSubmit.set(false);
        this.updateError.set(err.error?.error ?? 'Failed to update project.');
      }
    });
  }

  // ── Record expense ────────────────────────────────────────────────────────
  openExpenseForm(): void {
    this.expenseForm  = this.emptyExpenseForm();
    this.expenseError.set(null);
    this.expenseSuccess.set(null);
    this.showExpenseForm.set(true);
  }

  closeExpenseForm(): void { if (!this.expenseSubmit()) this.showExpenseForm.set(false); }

  submitExpense(): void {
    const f = this.expenseForm;
    this.expenseError.set(null);

    if (!f.amount || f.amount <= 0) {
      this.expenseError.set('Enter a valid amount.'); return;
    }
    if (!f.description.trim()) {
      this.expenseError.set('Description is required.'); return;
    }
    if (!f.expenseDate) {
      this.expenseError.set('Date is required.'); return;
    }

    this.expenseSubmit.set(true);
    this.financeService.createExpense({
      projectId:   this.projectId,
      amount:      f.amount,
      description: f.description.trim(),
      expenseDate: f.expenseDate,
      budgetLineId: f.budgetLineId ?? undefined
    }).subscribe({
      next: () => {
        this.expenseSubmit.set(false);
        this.expenseSuccess.set('Expense recorded successfully.');
        setTimeout(() => this.showExpenseForm.set(false), 1200);
      },
      error: err => {
        this.expenseSubmit.set(false);
        this.expenseError.set(err.error?.error ?? 'Failed to record expense.');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  statusClass(s: string | number): string {
    const map: Record<string, string> = {
      '0': 'badge badge-gray',    NotStarted: 'badge badge-gray',
      '1': 'badge badge-primary', InProgress: 'badge badge-primary',
      '2': 'badge badge-success', Completed:  'badge badge-success',
      '3': 'badge badge-warning', OnHold:     'badge badge-warning',
      '4': 'badge badge-danger',  Cancelled:  'badge badge-danger'
    };
    return map[String(s)] ?? 'badge badge-gray';
  }

  statusLabel(s: string | number): string {
    const map: Record<string, string> = {
      '0': 'Not Started', '1': 'In Progress', '2': 'Completed',
      '3': 'On Hold',     '4': 'Cancelled',
      NotStarted: 'Not Started', InProgress: 'In Progress',
      Completed:  'Completed',   OnHold: 'On Hold', Cancelled: 'Cancelled'
    };
    return map[String(s)] ?? String(s);
  }

  taskStatusDot(s: string | number): string {
    const map: Record<string, string> = {
      '1': 'dot-todo',       Todo:       'dot-todo',
      '2': 'dot-inprogress', InProgress: 'dot-inprogress',
      '3': 'dot-inreview',   InReview:   'dot-inreview',
      '4': 'dot-completed',  Completed:  'dot-completed'
    };
    return map[String(s)] ?? 'dot-todo';
  }

  taskStatusLabel(s: string | number): string {
    const map: Record<string, string> = {
      '1': 'To Do', '2': 'In Progress', '3': 'In Review', '4': 'Completed',
      Todo: 'To Do', InProgress: 'In Progress', InReview: 'In Review', Completed: 'Completed'
    };
    return map[String(s)] ?? String(s);
  }

  priorityLabel(p: string | number): string {
    const map: Record<string, string> = {
      '1': 'Low', '2': 'Medium', '3': 'High', '4': 'Urgent',
      Low: 'Low', Medium: 'Medium', High: 'High', Urgent: 'Urgent'
    };
    return map[String(p)] ?? String(p);
  }

  priorityClass(p: string | number): string {
    const map: Record<string, string> = {
      '1': 'badge-gray',    Low:    'badge-gray',
      '2': 'badge-info',    Medium: 'badge-info',
      '3': 'badge-warning', High:   'badge-warning',
      '4': 'badge-danger',  Urgent: 'badge-danger'
    };
    return map[String(p)] ?? 'badge-gray';
  }

  isOverdue(t: Task): boolean {
    const completed = String(t.status) === '4' || t.status === 'Completed';
    return !!t.dueDate && !completed && new Date(t.dueDate) < new Date();
  }

  private emptyUpdateForm(): UpdateProjectForm {
    return { status: 1, progressPercentage: 0, description: '', endDate: '' };
  }

  private emptyExpenseForm(): RecordExpenseForm {
    const today = new Date().toISOString().substring(0, 10);
    return { amount: null, description: '', expenseDate: today, budgetLineId: null };
  }
}
