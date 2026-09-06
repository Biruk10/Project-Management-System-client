import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProjectService } from '../../../core/services/project.service';
import { TaskService } from '../../../core/services/task.service';
import { FinanceService } from '../../../core/services/finance.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Project, ProjectMember, AddProjectMemberRequest } from '../../../core/models/project.models';
import { Task } from '../../../core/models/task.models';
import { Budget, BudgetLine, Expense, BudgetRequest } from '../../../core/models/finance.models';
import { User } from '../../../core/models/user.models';
import { PagedResult } from '../../../core/models/api.models';

interface UpdateProjectForm {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  projectManagerId: number | null;
  status: number;
  progressPercentage: number;
}

interface RecordExpenseForm {
  amount: number | null;
  description: string;
  expenseDate: string;
  budgetLineId: number | null;
}

interface AddBudgetForm {
  totalAmount: number | null;
  category: string;
}

interface BudgetRequestForm {
  category: string;
  budgetLineId: number | null;
  currentBudget: number;
  requestedAmount: number | null;
  reason: string;
}

interface AddMemberForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  projectRole: string;
}

interface ReviewBudgetRequestForm {
  requestId: number;
  approve: boolean;
  comment: string;
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
  users   = signal<User[]>([]);
  loading = signal(true);

  private authService    = inject(AuthService);
  private financeService = inject(FinanceService);
  private userService    = inject(UserService);
  private router         = inject(Router);

  /** Roles */
  readonly isOrgAdmin: boolean;
  readonly canManageProject: boolean;

  /** Primary budget computation */
  primaryBudget = computed(() => this.budgets().length > 0 ? this.budgets()[0] : null);
  hasBudget     = computed(() => this.budgets().length > 0);
  budgetCategories = computed(() => {
    const lines = this.primaryBudget()?.budgetLines ?? [];
    const categories = [...this.standardCategories];

    for (const line of lines) {
      if (!categories.some(category => category.toLowerCase() === line.category.toLowerCase())) {
        categories.push(line.category);
      }
    }

    return categories.map(category => ({
      category,
      line: lines.find(line => line.category.toLowerCase() === category.toLowerCase())
    }));
  });

  // ── Update project form ───────────────────────────────────────────────────
  showUpdateForm  = signal(false);
  updateSubmit    = signal(false);
  updateError     = signal<string | null>(null);
  updateSuccess   = signal<string | null>(null);
  updateForm: UpdateProjectForm = this.emptyUpdateForm();

  // ── Cancel project confirm ────────────────────────────────────────────────
  showCancelConfirm = signal(false);
  cancelSubmit      = signal(false);
  cancelError       = signal<string | null>(null);

  // ── Delete project confirm ────────────────────────────────────────────────
  showDeleteConfirm = signal(false);
  deleteSubmit      = signal(false);
  deleteError       = signal<string | null>(null);

  // ── Add budget form ───────────────────────────────────────────────────────
  showAddBudget   = signal(false);
  budgetSubmit    = signal(false);
  budgetError     = signal<string | null>(null);
  budgetSuccess   = signal<string | null>(null);
  budgetForm: AddBudgetForm = { totalAmount: null, category: 'General' };

  // ── Record expense form ───────────────────────────────────────────────────
  showExpenseForm  = signal(false);
  expenseSubmit    = signal(false);
  expenseError     = signal<string | null>(null);
  expenseSuccess   = signal<string | null>(null);
  expenseForm: RecordExpenseForm = this.emptyExpenseForm();

  // ── Update progress form (Project Manager) ─────────────────────────────────
  showProgressForm  = signal(false);
  progressSubmit    = signal(false);
  progressError     = signal<string | null>(null);
  progressSuccess   = signal<string | null>(null);
  progressForm = { status: 1, completion: 0 };

  // ── Budget Requests (PM & OrgAdmin) ───────────────────────────────────────
  budgetRequests      = signal<BudgetRequest[]>([]);
  showRequestModal    = signal(false);
  requestSubmit       = signal(false);
  requestError        = signal<string | null>(null);
  requestSuccess      = signal<string | null>(null);
  requestForm: BudgetRequestForm = this.emptyBudgetRequestForm();

  // Review Budget Request Modal (OrgAdmin)
  showReviewModal     = signal(false);
  reviewSubmit        = signal(false);
  reviewError         = signal<string | null>(null);
  reviewForm: ReviewBudgetRequestForm = { requestId: 0, approve: true, comment: '' };
  reviewTarget        = signal<BudgetRequest | null>(null);

  // ── Add Member Form (PM & OrgAdmin) ───────────────────────────────────────
  showAddMemberModal  = signal(false);
  addMemberSubmit     = signal(false);
  addMemberError      = signal<string | null>(null);
  addMemberSuccess    = signal<string | null>(null);
  addMemberForm: AddMemberForm = this.emptyAddMemberForm();

  // Category history modal or expanded category view
  selectedCategory    = signal<BudgetLine | null>(null);
  showCategoryHistory = signal(false);
  categoryExpenses    = signal<Expense[]>([]);

  readonly standardCategories = [
    'Personnel',
    'Equipment',
    'Transportation',
    'Training',
    'Materials',
    'Operations',
    'Other'
  ];

  readonly projectRoles = [
    'Project Coordinator',
    'Team Leader',
    'Backend Developer',
    'Frontend Developer',
    'UI/UX Designer',
    'Accountant',
    'Data Analyst',
    'QA Tester',
    'Field Officer',
    'Consultant',
    'Other'
  ];

  readonly progressStatuses = [
    { value: 0, label: 'To Do'       },
    { value: 1, label: 'In Progress' },
    { value: 3, label: 'In Review'   },
    { value: 2, label: 'Completed'   }
  ];

  readonly completionOptions = [0, 25, 50, 75, 100];

  readonly projectStatuses = [
    { value: 0, label: 'Not Started' },
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
    this.isOrgAdmin = u?.roles.includes('OrganizationAdmin') ?? false;
    this.canManageProject = (u?.roles.includes('ProjectManager') ?? false) || this.isOrgAdmin;
  }

  ngOnInit(): void {
    this.projectId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadProject();
    this.loadTasks();
    this.loadBudgets();
    this.loadUsers();
    this.loadBudgetRequests();
  }

  loadProject(): void {
    this.projectService.getById(this.projectId).subscribe({
      next: p  => { this.project.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadTasks(): void {
    this.taskService.getAll({ projectId: this.projectId, pageSize: 10 }).subscribe({
      next: t => this.tasks.set(t)
    });
  }

  loadBudgets(): void {
    this.financeService.getBudgetsByProject(this.projectId).subscribe({
      next: b => this.budgets.set(b)
    });
  }

  loadUsers(): void {
    this.userService.getAll({ pageSize: 100 }).subscribe({
      next: r => this.users.set(r.items)
    });
  }

  loadBudgetRequests(): void {
    this.financeService.getBudgetRequestsByProject(this.projectId).subscribe({
      next: r => this.budgetRequests.set(r)
    });
  }

  openCategoryHistory(line: BudgetLine): void {
    this.selectedCategory.set(line);
    this.financeService.getExpenses({ projectId: this.projectId, budgetLineId: line.id }).subscribe({
      next: res => {
        this.categoryExpenses.set(res.items);
        this.showCategoryHistory.set(true);
      },
      error: () => {
        this.categoryExpenses.set([]);
        this.showCategoryHistory.set(true);
      }
    });
  }

  closeCategoryHistory(): void {
    this.showCategoryHistory.set(false);
  }

  // ── Update project ────────────────────────────────────────────────────────
  openUpdateForm(): void {
    const p = this.project();
    if (!p) return;
    const statusNum = Number(p.status);
    this.updateForm = {
      name:               p.name,
      description:        p.description ?? '',
      startDate:          p.startDate ? p.startDate.substring(0, 10) : '',
      endDate:            p.endDate ? p.endDate.substring(0, 10) : '',
      projectManagerId:   p.projectManagerId ?? null,
      status:             isNaN(statusNum) ? 1 : statusNum,
      progressPercentage: p.progressPercentage
    };
    this.updateError.set(null);
    this.updateSuccess.set(null);
    this.showUpdateForm.set(true);
  }

  closeUpdateForm(): void {
    if (!this.updateSubmit()) this.showUpdateForm.set(false);
  }

  submitUpdate(): void {
    const p = this.project();
    if (!p) return;
    this.updateError.set(null);

    if (!this.updateForm.name.trim()) {
      this.updateError.set('Project name is required.');
      return;
    }
    if (!this.updateForm.startDate) {
      this.updateError.set('Start date is required.');
      return;
    }

    const pct = Number(this.updateForm.progressPercentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      this.updateError.set('Progress must be between 0 and 100.');
      return;
    }

    this.updateSubmit.set(true);
    this.projectService.update(this.projectId, {
      name:               this.updateForm.name.trim(),
      description:        this.updateForm.description.trim() || undefined,
      startDate:          this.updateForm.startDate,
      endDate:            this.updateForm.endDate || undefined,
      status:             this.updateForm.status as any,
      progressPercentage: pct,
      projectManagerId:   this.updateForm.projectManagerId ?? undefined
    }).subscribe({
      next: updated => {
        this.project.set(updated);
        this.updateSubmit.set(false);
        this.updateSuccess.set('Project updated successfully.');
        setTimeout(() => this.showUpdateForm.set(false), 1000);
      },
      error: err => {
        this.updateSubmit.set(false);
        this.updateError.set(err.error?.error ?? 'Failed to update project.');
      }
    });
  }

  // ── Cancel project ────────────────────────────────────────────────────────
  openCancelConfirm(): void {
    this.cancelError.set(null);
    this.showCancelConfirm.set(true);
  }

  closeCancelConfirm(): void {
    if (!this.cancelSubmit()) this.showCancelConfirm.set(false);
  }

  confirmCancelProject(): void {
    const p = this.project();
    if (!p) return;
    this.cancelSubmit.set(true);
    this.cancelError.set(null);

    this.projectService.update(this.projectId, {
      name:               p.name,
      description:        p.description || undefined,
      startDate:          p.startDate,
      endDate:            p.endDate || undefined,
      status:             4 as any, // Cancelled
      progressPercentage: p.progressPercentage,
      projectManagerId:   p.projectManagerId ?? undefined
    }).subscribe({
      next: updated => {
        this.project.set(updated);
        this.cancelSubmit.set(false);
        this.showCancelConfirm.set(false);
      },
      error: err => {
        this.cancelSubmit.set(false);
        this.cancelError.set(err.error?.error ?? 'Failed to cancel project.');
      }
    });
  }

  // ── Delete project ────────────────────────────────────────────────────────
  openDeleteConfirm(): void {
    this.deleteError.set(null);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm(): void {
    if (!this.deleteSubmit()) this.showDeleteConfirm.set(false);
  }

  confirmDeleteProject(): void {
    this.deleteSubmit.set(true);
    this.deleteError.set(null);

    this.projectService.delete(this.projectId).subscribe({
      next: () => {
        this.deleteSubmit.set(false);
        this.showDeleteConfirm.set(false);
        this.router.navigate(['/projects']);
      },
      error: err => {
        this.deleteSubmit.set(false);
        this.deleteError.set(err.error?.error ?? 'Failed to delete project.');
      }
    });
  }

  // ── Add budget form ───────────────────────────────────────────────────────
  openAddBudgetForm(): void {
    this.budgetForm = { totalAmount: null, category: 'General' };
    this.budgetError.set(null);
    this.budgetSuccess.set(null);
    this.showAddBudget.set(true);
  }

  closeAddBudgetForm(): void {
    if (!this.budgetSubmit()) this.showAddBudget.set(false);
  }

  submitAddBudget(): void {
    const f = this.budgetForm;
    this.budgetError.set(null);

    if (!f.totalAmount || f.totalAmount <= 0) {
      this.budgetError.set('Please enter a valid budget amount greater than 0.');
      return;
    }

    this.budgetSubmit.set(true);
    this.financeService.createBudget({
      projectId:   this.projectId,
      totalAmount: f.totalAmount,
      budgetLines: [
        {
          category:        f.category.trim() || 'General',
          allocatedAmount: f.totalAmount,
          description:     'Initial budget allocation'
        }
      ]
    }).subscribe({
      next: created => {
        if (this.isOrgAdmin) {
          this.financeService.approveBudget(created.id).subscribe({
            next: () => {
              this.budgetSubmit.set(false);
              this.budgetSuccess.set('Budget created and approved.');
              this.loadBudgets();
              setTimeout(() => this.showAddBudget.set(false), 1000);
            },
            error: () => {
              this.budgetSubmit.set(false);
              this.budgetSuccess.set('Budget created successfully.');
              this.loadBudgets();
              setTimeout(() => this.showAddBudget.set(false), 1000);
            }
          });
        } else {
          this.budgetSubmit.set(false);
          this.budgetSuccess.set('Budget submitted successfully.');
          this.loadBudgets();
          setTimeout(() => this.showAddBudget.set(false), 1000);
        }
      },
      error: err => {
        this.budgetSubmit.set(false);
        this.budgetError.set(err.error?.error ?? 'Failed to create budget.');
      }
    });
  }

  // ── Record expense ────────────────────────────────────────────────────────
  openExpenseForm(): void {
    this.expenseForm = this.emptyExpenseForm();
    const b = this.primaryBudget();
    if (b && b.budgetLines.length > 0) {
      this.expenseForm.budgetLineId = b.budgetLines[0].id;
    }
    this.expenseError.set(null);
    this.expenseSuccess.set(null);
    this.showExpenseForm.set(true);
  }

  closeExpenseForm(): void {
    if (!this.expenseSubmit()) this.showExpenseForm.set(false);
  }

  submitExpense(): void {
    const f = this.expenseForm;
    this.expenseError.set(null);

    if (!this.hasBudget()) {
      this.expenseError.set('Cannot record expense: A project budget must be added first.');
      return;
    }

    if (!f.amount || f.amount <= 0) {
      this.expenseError.set('Enter a valid amount.');
      return;
    }
    if (!f.description.trim()) {
      this.expenseError.set('Description is required.');
      return;
    }
    if (!f.expenseDate) {
      this.expenseError.set('Date is required.');
      return;
    }

    const formattedDate = f.expenseDate.includes('T') ? f.expenseDate : `${f.expenseDate}T00:00:00.000Z`;

    this.expenseSubmit.set(true);
    this.financeService.createExpense({
      projectId:    this.projectId,
      amount:       f.amount,
      description:  f.description.trim(),
      expenseDate:  formattedDate,
      budgetLineId: f.budgetLineId ?? undefined
    }).subscribe({
      next: () => {
        this.expenseSubmit.set(false);
        this.expenseSuccess.set('Expense recorded successfully.');
        this.loadBudgets();
        setTimeout(() => this.showExpenseForm.set(false), 1000);
      },
      error: err => {
        this.expenseSubmit.set(false);
        this.expenseError.set(err.error?.error ?? 'Failed to record expense.');
      }
    });
  }

  // ── Update progress (Project Manager) ──────────────────────────────────────
  openProgressForm(): void {
    const p = this.project();
    if (!p) return;
    const statusNum = Number(p.status);
    this.progressForm = {
      status:     isNaN(statusNum) ? 1 : statusNum,
      completion: p.progressPercentage ?? 0
    };
    this.progressError.set(null);
    this.progressSuccess.set(null);
    this.showProgressForm.set(true);
  }

  closeProgressForm(): void {
    if (!this.progressSubmit()) this.showProgressForm.set(false);
  }

  submitProgress(): void {
    const p = this.project();
    if (!p) return;
    this.progressError.set(null);

    this.progressSubmit.set(true);
    this.projectService.update(this.projectId, {
      name:               p.name,
      description:        p.description || undefined,
      startDate:          p.startDate,
      endDate:            p.endDate || undefined,
      status:             this.progressForm.status as any,
      progressPercentage: this.progressForm.completion,
      projectManagerId:   p.projectManagerId ?? undefined
    }).subscribe({
      next: updated => {
        this.project.set(updated);
        this.progressSubmit.set(false);
        this.progressSuccess.set('Progress updated successfully.');
        setTimeout(() => this.showProgressForm.set(false), 1000);
      },
      error: err => {
        this.progressSubmit.set(false);
        this.progressError.set(err.error?.error ?? 'Failed to update progress.');
      }
    });
  }

  // ── Budget Request Flow (PM & OrgAdmin) ──────────────────────────────────
  openBudgetRequestModal(category?: string, lineId?: number): void {
    const p = this.project();
    const primary = this.primaryBudget();
    let currentAmount = 0;
    let targetCat = category ?? this.standardCategories[0];
    let targetLineId = lineId ?? null;

    if (primary && primary.budgetLines.length > 0) {
      if (targetLineId) {
        const bl = primary.budgetLines.find(l => l.id === targetLineId);
        if (bl) { currentAmount = bl.allocatedAmount; targetCat = bl.category; }
      } else {
        const bl = primary.budgetLines.find(l => l.category.toLowerCase() === targetCat.toLowerCase());
        if (bl) { currentAmount = bl.allocatedAmount; targetLineId = bl.id; }
      }
    }

    this.requestForm = {
      category: targetCat,
      budgetLineId: targetLineId,
      currentBudget: currentAmount,
      requestedAmount: null,
      reason: ''
    };
    this.requestError.set(null);
    this.requestSuccess.set(null);
    this.showRequestModal.set(true);
  }

  onCategoryChangeInRequest(): void {
    const primary = this.primaryBudget();
    if (!primary) {
      this.requestForm.currentBudget = 0;
      this.requestForm.budgetLineId = null;
      return;
    }
    const bl = primary.budgetLines.find(l => l.category.toLowerCase() === this.requestForm.category.toLowerCase());
    if (bl) {
      this.requestForm.currentBudget = bl.allocatedAmount;
      this.requestForm.budgetLineId = bl.id;
    } else {
      this.requestForm.currentBudget = 0;
      this.requestForm.budgetLineId = null;
    }
  }

  closeBudgetRequestModal(): void {
    if (!this.requestSubmit()) this.showRequestModal.set(false);
  }

  submitBudgetRequest(): void {
    const f = this.requestForm;
    this.requestError.set(null);

    if (!f.requestedAmount || f.requestedAmount <= 0) {
      this.requestError.set('Please enter a valid requested amount greater than 0.');
      return;
    }
    if (!f.reason.trim()) {
      this.requestError.set('Reason for the request is required.');
      return;
    }

    this.requestSubmit.set(true);
    this.financeService.createBudgetRequest({
      projectId: this.projectId,
      budgetLineId: f.budgetLineId ?? undefined,
      category: f.category,
      requestedAmount: f.requestedAmount,
      reason: f.reason.trim()
    }).subscribe({
      next: () => {
        this.requestSubmit.set(false);
        this.requestSuccess.set('Budget request submitted successfully.');
        this.loadBudgetRequests();
        setTimeout(() => this.showRequestModal.set(false), 1200);
      },
      error: err => {
        this.requestSubmit.set(false);
        this.requestError.set(err.error?.error ?? 'Failed to submit budget request.');
      }
    });
  }

  // ── Review Budget Request (Org Admin) ─────────────────────────────────────
  openReviewModal(req: BudgetRequest, approve: boolean): void {
    this.reviewTarget.set(req);
    this.reviewForm = {
      requestId: req.id,
      approve,
      comment: ''
    };
    this.reviewError.set(null);
    this.showReviewModal.set(true);
  }

  closeReviewModal(): void {
    if (!this.reviewSubmit()) this.showReviewModal.set(false);
  }

  submitReview(): void {
    const f = this.reviewForm;
    this.reviewSubmit.set(true);
    this.reviewError.set(null);

    this.financeService.reviewBudgetRequest(f.requestId, {
      approve: f.approve,
      reviewComment: f.comment.trim() || undefined
    }).subscribe({
      next: () => {
        this.reviewSubmit.set(false);
        this.showReviewModal.set(false);
        this.loadBudgetRequests();
        this.loadBudgets();
      },
      error: err => {
        this.reviewSubmit.set(false);
        this.reviewError.set(err.error?.error ?? 'Failed to review budget request.');
      }
    });
  }

  // ── Team Members (PM & OrgAdmin) ──────────────────────────────────────────
  openAddMemberModal(): void {
    this.addMemberForm = this.emptyAddMemberForm();
    this.addMemberError.set(null);
    this.addMemberSuccess.set(null);
    this.showAddMemberModal.set(true);
  }

  closeAddMemberModal(): void {
    if (!this.addMemberSubmit()) this.showAddMemberModal.set(false);
  }

  submitAddMember(): void {
    const f = this.addMemberForm;
    this.addMemberError.set(null);

    if (!f.firstName.trim()) {
      this.addMemberError.set('First name is required.');
      return;
    }
    if (!f.lastName.trim()) {
      this.addMemberError.set('Last name is required.');
      return;
    }
    if (!f.email.trim() || !f.email.includes('@')) {
      this.addMemberError.set('A valid email address is required.');
      return;
    }
    if (!f.projectRole.trim()) {
      this.addMemberError.set('Project role is required.');
      return;
    }

    this.addMemberSubmit.set(true);
    this.projectService.addMember(this.projectId, {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      email: f.email.trim(),
      phone: f.phone.trim() || undefined,
      projectRole: f.projectRole.trim()
    }).subscribe({
      next: updated => {
        this.project.set(updated);
        this.addMemberSubmit.set(false);
        this.addMemberSuccess.set('Team member added successfully.');
        setTimeout(() => this.showAddMemberModal.set(false), 1000);
      },
      error: err => {
        this.addMemberSubmit.set(false);
        this.addMemberError.set(err.error?.error ?? 'Failed to add team member.');
      }
    });
  }

  removeMember(member: ProjectMember): void {
    if (!confirm(`Are you sure you want to remove ${member.fullName || member.email} from the project?`)) {
      return;
    }
    this.projectService.removeMember(this.projectId, member.id || member.userId!).subscribe({
      next: () => {
        this.loadProject();
      },
      error: err => {
        alert(err.error?.error ?? 'Failed to remove member.');
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  isCancelled(): boolean {
    const p = this.project();
    if (!p) return false;
    return String(p.status) === '4' || p.status === 'Cancelled';
  }

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
    return {
      name: '',
      description: '',
      startDate: '',
      endDate: '',
      projectManagerId: null,
      status: 1,
      progressPercentage: 0
    };
  }

  private emptyExpenseForm(): RecordExpenseForm {
    const today = new Date().toISOString().substring(0, 10);
    return { amount: null, description: '', expenseDate: today, budgetLineId: null };
  }

  private emptyBudgetRequestForm(): BudgetRequestForm {
    return {
      category: 'Personnel',
      budgetLineId: null,
      currentBudget: 0,
      requestedAmount: null,
      reason: ''
    };
  }

  private emptyAddMemberForm(): AddMemberForm {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      projectRole: 'Project Coordinator'
    };
  }
}
