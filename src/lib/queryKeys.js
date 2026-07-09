// Central registry of query keys so invalidation calls across different
// pages stay in sync with what each page actually fetches under.
export const queryKeys = {
  workersApproved: ['labourers', 'approved'],
  workersByStatus: (status) => ['labourers', 'status', status],
  worker: (id) => ['labourers', 'detail', id],
  workerBankAccounts: (id) => ['labourer_bank_accounts', id],
  workerJobHistory: (id) => ['job_workers', 'by-labourer', id],

  hirersActive: ['hirers', 'active'],
  hirersByStatus: (status) => ['hirers', 'status', status],
  hirer: (id) => ['hirers', 'detail', id],
  hirerBankAccounts: (id) => ['hirer_bank_accounts', id],
  hirerJobs: (id) => ['jobs', 'by-hirer', id],

  jobs: ['jobs', 'all'],
  job: (id) => ['jobs', 'detail', id],
  jobWorkers: (id) => ['job_workers', 'by-job', id],

  bankAccountsPending: ['bank_accounts', 'pending-review'],

  settlementsBundle: ['settlements', 'bundle'],

  dashboardStats: ['dashboard', 'stats'],
  analyticsBundle: ['analytics', 'bundle'],

  adminUsers: ['admin_users'],
  activityLogs: ['admin_activity_logs'],
};
