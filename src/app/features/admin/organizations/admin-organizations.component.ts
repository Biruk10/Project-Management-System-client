import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';

interface RegisterOrgForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  timeZone: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPassword: string;
}

@Component({
  selector: 'app-admin-organizations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-organizations.component.html',
  styleUrl: './admin-organizations.component.scss'
})
export class AdminOrganizationsComponent implements OnInit {
  loading  = signal(true);
  allOrgs  = signal<any[]>([]);
  filtered = signal<any[]>([]);
  actionId = signal<number | null>(null);
  search = '';
  statusFilter = '';

  // Registration modal
  showModal   = signal(false);
  submitting  = signal(false);
  formError   = signal<string | null>(null);
  formSuccess = signal<string | null>(null);

  form: RegisterOrgForm = this.emptyForm();

  constructor(private api: ApiService) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.get<any[]>('/platform/organizations').subscribe({
      next: (data) => {
        const list = Array.isArray(data) ? data : [];
        this.allOrgs.set(list);
        this.applyFilter();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  applyFilter(): void {
    let list = this.allOrgs();
    if (this.search.trim()) {
      const s = this.search.toLowerCase();
      list = list.filter(o => o.name.toLowerCase().includes(s) || o.email.toLowerCase().includes(s));
    }
    if (this.statusFilter === 'active')    list = list.filter(o => o.isActive);
    if (this.statusFilter === 'suspended') list = list.filter(o => !o.isActive);
    this.filtered.set(list);
  }

  activate(id: number): void {
    this.actionId.set(id);
    this.api.patch<void>(`/platform/organizations/${id}/activate`, {}).subscribe({
      next: () => { this.actionId.set(null); this.load(); },
      error: () => this.actionId.set(null)
    });
  }

  suspend(id: number): void {
    this.actionId.set(id);
    this.api.patch<void>(`/platform/organizations/${id}/suspend`, {}).subscribe({
      next: () => { this.actionId.set(null); this.load(); },
      error: () => this.actionId.set(null)
    });
  }

  openModal(): void {
    this.form = this.emptyForm();
    this.formError.set(null);
    this.formSuccess.set(null);
    this.showModal.set(true);
  }

  closeModal(): void {
    if (this.submitting()) return;
    this.showModal.set(false);
  }

  submitRegister(): void {
    this.formError.set(null);
    this.formSuccess.set(null);

    const f = this.form;
    if (!f.name.trim() || !f.email.trim() || !f.adminFirstName.trim() ||
        !f.adminLastName.trim() || !f.adminEmail.trim() || !f.adminPassword.trim()) {
      this.formError.set('Please fill in all required fields.');
      return;
    }
    if (f.adminPassword.length < 8) {
      this.formError.set('Admin password must be at least 8 characters.');
      return;
    }

    this.submitting.set(true);
    this.api.post<any>('/auth/register', {
      name:           f.name.trim(),
      email:          f.email.trim(),
      phone:          f.phone.trim() || undefined,
      address:        f.address.trim() || undefined,
      timeZone:       f.timeZone || 'UTC',
      adminFirstName: f.adminFirstName.trim(),
      adminLastName:  f.adminLastName.trim(),
      adminEmail:     f.adminEmail.trim(),
      adminPassword:  f.adminPassword
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.formSuccess.set(`Organization "${res.organization?.name}" registered successfully.`);
        this.load();
        setTimeout(() => this.closeModal(), 1800);
      },
      error: (err) => {
        this.submitting.set(false);
        this.formError.set(err.error?.error ?? 'Registration failed. Please try again.');
      }
    });
  }

  private emptyForm(): RegisterOrgForm {
    return { name: '', email: '', phone: '', address: '', timeZone: 'UTC',
             adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '' };
  }
}
