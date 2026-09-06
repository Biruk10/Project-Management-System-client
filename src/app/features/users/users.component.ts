import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { TaskService } from '../../core/services/task.service';
import { ProjectService } from '../../core/services/project.service';
import { ApiService } from '../../core/services/api.service';
import { User } from '../../core/models/user.models';
import { Project } from '../../core/models/project.models';
import { PagedResult } from '../../core/models/api.models';

interface RoleOption { id: number; name: string; }

interface NewUserForm {
  firstName: string;
  lastName:  string;
  email:     string;
  password:  string;
  roleId:    number | null;
}

interface AssignTaskForm {
  title:       string;
  description: string;
  projectId:   number | null;
  priority:    number;            // 1=Low 2=Medium 3=High 4=Urgent
  dueDate:     string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrl:    './users.component.scss'
})
export class UsersComponent implements OnInit {

  // ── list ──────────────────────────────────────────────────────────────────
  result       = signal<PagedResult<User> | null>(null);
  loading      = signal(true);
  page         = 1;
  search       = '';
  activeFilter = '';

  // ── new-user modal ────────────────────────────────────────────────────────
  showNewUser  = signal(false);
  submitting   = signal(false);
  formError    = signal<string | null>(null);
  roles        = signal<RoleOption[]>([]);
  newUserForm: NewUserForm = this.emptyNewUserForm();

  // ── assign-task modal ─────────────────────────────────────────────────────
  showAssignTask  = signal(false);
  taskSubmitting  = signal(false);
  taskError       = signal<string | null>(null);
  taskSuccess     = signal<string | null>(null);
  selectedUser    = signal<User | null>(null);
  projects        = signal<Project[]>([]);
  taskForm: AssignTaskForm = this.emptyTaskForm();

  readonly priorities = [
    { value: 1, label: 'Low'    },
    { value: 2, label: 'Medium' },
    { value: 3, label: 'High'   },
    { value: 4, label: 'Urgent' }
  ];

  constructor(
    private userService:    UserService,
    private taskService:    TaskService,
    private projectService: ProjectService,
    private api:            ApiService
  ) {}

  ngOnInit(): void {
    this.load();
    this.loadRoles();
    this.loadProjects();
  }

  // ── list helpers ──────────────────────────────────────────────────────────
  load(): void {
    this.loading.set(true);
    this.userService.getAll({
      page:     this.page,
      search:   this.search       || undefined,
      isActive: this.activeFilter !== '' ? this.activeFilter === 'true' : undefined
    }).subscribe({
      next:  d  => { this.result.set(d); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  loadRoles(): void {
    this.api.get<RoleOption[]>('/roles').subscribe({ next: r => this.roles.set(r) });
  }

  loadProjects(): void {
    this.projectService.getAll({ pageSize: 100 }).subscribe({
      next: r => this.projects.set(r.items)
    });
  }

  onSearch(): void  { this.page = 1; this.load(); }
  changePage(p: number): void { this.page = p; this.load(); }

  toggle(user: User): void {
    const action = user.isActive
      ? this.userService.deactivate(user.id)
      : this.userService.activate(user.id);
    action.subscribe({ next: () => this.load() });
  }

  // ── new-user modal ────────────────────────────────────────────────────────
  openNewUser(): void {
    this.newUserForm = this.emptyNewUserForm();
    this.formError.set(null);
    this.showNewUser.set(true);
  }

  closeNewUser(): void { if (!this.submitting()) this.showNewUser.set(false); }

  submitCreate(): void {
    this.formError.set(null);
    const f = this.newUserForm;

    if (!f.firstName.trim() || !f.lastName.trim()) {
      this.formError.set('First and last name are required.'); return;
    }
    if (!f.email.trim()) {
      this.formError.set('Email is required.'); return;
    }
    if (!f.password || f.password.length < 8) {
      this.formError.set('Password must be at least 8 characters.'); return;
    }
    if (f.roleId === null) {
      this.formError.set('Please assign a role.'); return;
    }

    this.submitting.set(true);
    this.userService.create({
      firstName: f.firstName.trim(),
      lastName:  f.lastName.trim(),
      email:     f.email.trim(),
      password:  f.password,
      roleIds:   [f.roleId]
    }).subscribe({
      next: () => { this.submitting.set(false); this.showNewUser.set(false); this.load(); },
      error: err => {
        this.submitting.set(false);
        this.formError.set(err.error?.error ?? 'Failed to create user. Please try again.');
      }
    });
  }

  // ── assign-task modal ─────────────────────────────────────────────────────
  openAssignTask(user: User): void {
    this.selectedUser.set(user);
    this.taskForm = this.emptyTaskForm();
    this.taskError.set(null);
    this.taskSuccess.set(null);
    this.showAssignTask.set(true);
  }

  closeAssignTask(): void { if (!this.taskSubmitting()) this.showAssignTask.set(false); }

  submitAssignTask(): void {
    this.taskError.set(null);
    const f = this.taskForm;
    const user = this.selectedUser();

    if (!f.title.trim()) {
      this.taskError.set('Task title is required.'); return;
    }
    if (!f.projectId) {
      this.taskError.set('Please select a project.'); return;
    }
    if (!user) return;

    this.taskSubmitting.set(true);
    this.taskService.create({
      title:            f.title.trim(),
      description:      f.description.trim() || undefined,
      projectId:        f.projectId,
      assignedToUserId: user.id,
      priority:         f.priority as any,   // numeric enum
      dueDate:          f.dueDate || undefined
    }).subscribe({
      next: () => {
        this.taskSubmitting.set(false);
        this.taskSuccess.set(`Task assigned to ${user.firstName} ${user.lastName}.`);
        setTimeout(() => this.showAssignTask.set(false), 1400);
      },
      error: err => {
        this.taskSubmitting.set(false);
        this.taskError.set(err.error?.error ?? 'Failed to assign task. Please try again.');
      }
    });
  }

  // ── status label ──────────────────────────────────────────────────────────
  statusLabel(status: number | string): string {
    const map: Record<string, string> = {
      '1': 'Active', '2': 'Inactive', '3': 'Pending', '4': 'Suspended',
      Active: 'Active', Inactive: 'Inactive', Pending: 'Pending', Suspended: 'Suspended'
    };
    return map[String(status)] ?? String(status);
  }

  // ── private helpers ───────────────────────────────────────────────────────
  private emptyNewUserForm(): NewUserForm {
    return { firstName: '', lastName: '', email: '', password: '', roleId: null };
  }

  private emptyTaskForm(): AssignTaskForm {
    return { title: '', description: '', projectId: null, priority: 2, dueDate: '' };
  }
}
