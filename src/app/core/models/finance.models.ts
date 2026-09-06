export interface Budget {
  id: number;
  organizationId: number;
  projectId: number;
  projectName: string;
  totalAmount: number;
  status: string;
  approvedBy?: number;
  approvedByName?: string;
  approvedAt?: string;
  totalExpenses: number;
  remainingBudget: number;
  utilizationPercentage: number;
  createdAt: string;
  budgetLines: BudgetLine[];
}

export interface BudgetLine {
  id: number;
  budgetId: number;
  category: string;
  description?: string;
  allocatedAmount: number;
  spentAmount: number;
}

export interface Expense {
  id: number;
  organizationId: number;
  projectId: number;
  projectName: string;
  budgetLineId?: number;
  budgetLineCategory?: string;
  amount: number;
  description: string;
  expenseDate: string;
  recordedByUserId?: number;
  recordedByUserName?: string;
  createdAt: string;
}

export interface CreateBudgetRequest {
  projectId: number;
  totalAmount: number;
  budgetLines: CreateBudgetLineRequest[];
}

export interface CreateBudgetLineRequest {
  category: string;
  description?: string;
  allocatedAmount: number;
}

export interface CreateExpenseRequest {
  projectId: number;
  budgetLineId?: number;
  amount: number;
  description: string;
  expenseDate: string;
}

export interface ExpenseFilterParams {
  page?: number;
  pageSize?: number;
  projectId?: number;
  budgetLineId?: number;
  from?: string;
  to?: string;
}

export interface BudgetRequest {
  id: number;
  organizationId: number;
  projectId: number;
  projectName: string;
  projectManagerId?: number;
  projectManagerName?: string;
  budgetLineId?: number;
  category: string;
  currentBudget: number;
  requestedAmount: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Declined' | number;
  reviewedBy?: number;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewComment?: string;
  createdAt: string;
}

export interface CreateBudgetRequestPayload {
  projectId: number;
  budgetLineId?: number;
  category: string;
  requestedAmount: number;
  reason: string;
}

export interface ReviewBudgetRequestPayload {
  approve: boolean;
  reviewComment?: string;
}
