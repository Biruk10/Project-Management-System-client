export interface Project {
  id: number;
  organizationId: number;
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: string;
  progressPercentage: number;
  projectManagerId?: number;
  projectManagerName?: string;
  createdAt: string;
  members: ProjectMember[];
}

export interface ProjectMember {
  id: number;
  userId?: number;
  firstName?: string;
  lastName?: string;
  fullName: string;
  email: string;
  phone?: string;
  projectRole: string;
  joinedAt: string;
}

export interface AddProjectMemberRequest {
  userId?: number;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  projectRole: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  projectManagerId?: number;
  initialBudget?: number;
  budgetCategory?: string;
}

export interface UpdateProjectRequest {
  name: string;
  description?: string;
  startDate: string;
  endDate?: string;
  status: string;
  progressPercentage: number;
  projectManagerId?: number;
}

export interface ProjectFilterParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  projectManagerId?: number;
}
