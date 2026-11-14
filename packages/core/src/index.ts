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
export { SESSION_COOKIE, purgeExpiredSessions, resolveSession, sessionCookieMaxAge } from './auth/session';
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
  getReportDocument,
  getReportPdf,
  listReports,
  prepareReportDraft,
  updateReport,
  uploadReportPdf,
  type CreateReportOptions,
  type UploadedPdf,
  type UploadResult,
} from './services/reports';
export { createReportTemplate, deleteReportTemplate, listReportTemplates, updateReportTemplate } from './services/report-templates';
export { readScanArea } from './services/ocr';
export { addReportImage, getPdfPagePreview, type ReportImageSource } from './services/report-images';
export {
  deleteImagingStudy,
  getImagingGeometry,
  getImagingPreview,
  getImagingStudy,
  linkImagingStudyReport,
  listImagingStudies,
  listReportImagingStudies,
  renameImagingStudy,
  setReportImagingStudies,
  uploadDicomFiles,
  type ImagingPreviewSize,
  type UploadedDicom,
} from './services/imaging';
export {
  createMedication,
  deleteMedication,
  getDrugOptions,
  getTherapyPdf,
  listDrugCatalog,
  listMedications,
  searchDrugs,
  stopMedication,
  updateMedication,
} from './services/medications';
export {
  AIFA_CATALOG_URL,
  decodeCsv,
  downloadDrugCatalog,
  drugRowsFromCsv,
  drugStrength,
  getDrugCatalogStatus,
  getDrugInfo,
  getDrugLeaflet,
  importDrugCatalog,
  replaceDrugCatalog,
  type DrugInfo,
} from './services/drug-catalog';
export {
  HEALTH_SERVICES_PAGE_URL,
  downloadHealthServices,
  getHealthService,
  getHealthServiceCatalogStatus,
  healthServiceFileLinks,
  healthServiceRowsFromXlsx,
  healthServiceTariffsFromXlsx,
  importHealthServices,
  listHealthServices,
  replaceHealthServices,
} from './services/health-services';
export { excelDate, readXlsxSheets } from './xlsx';
export { getLabTrend, listLabTrends } from './services/trends';
export {
  getServerSettings,
  getServerStatus,
  getStorageUsage,
  revokeAllSessions,
  runMaintenanceNow,
  updateServerSettings,
} from './services/settings';
