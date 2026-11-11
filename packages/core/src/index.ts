/**
 * Logica applicativa e di sicurezza, indipendente dal framework.
 * Usata dalla webapp (Server Component e Server Action) e dall'API per l'app mobile:
 * permessi, validazione e registro accessi sono scritti una volta sola, qui.
 * Da importare SOLO lato server.
 */
export { getConfig, loadRootEnv } from './config';
export type { AuthUser, AuthedContext, RequestContext } from './context';
export { AppError, fromDatabaseError } from './errors';
export { requireAdmin, requireUser } from './auth/guard';
export { SESSION_COOKIE, purgeExpiredSessions, resolveSession } from './auth/session';
export { listAudit } from './services/audit';
export { getPatientPermission } from './services/access';
export { changePassword, login, logout, needsSetup, setupAdmin, type SignedIn } from './services/auth';
export { createPatient, deletePatient, getPatient, listPatients, updatePatient } from './services/patients';
export { createUser, listUsers, resetUserPassword, updateUser } from './services/users';
export {
  createReport,
  deleteReport,
  discardReportPdf,
  getReport,
  getReportPdf,
  listReports,
  prepareReportDraft,
  updateReport,
  uploadReportPdf,
  type CreateReportOptions,
  type UploadedPdf,
  type UploadResult,
} from './services/reports';
export { deleteImagingStudy, listImagingStudies, uploadDicomFiles, type UploadedDicom } from './services/imaging';
